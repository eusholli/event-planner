import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { geocodeAddress } from '@/lib/geocoding'
import { withAuth } from '@/lib/with-auth'
import { emailsToUserIds } from '@/lib/clerk-export'

export const dynamic = 'force-dynamic'

const postHandler = withAuth(async (request) => {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

        const MAX_IMPORT_SIZE = 10 * 1024 * 1024 // 10 MB
        if (file.size > MAX_IMPORT_SIZE) {
            return NextResponse.json({ error: 'Import file too large (max 10 MB)' }, { status: 413 })
        }

        const text = await file.text()
        const config = JSON.parse(text)
        const warnings: string[] = []

        const supportedVersions = ['5.0', '5.1']
        if (config.version && !supportedVersions.includes(config.version)) {
            warnings.push(`File version is ${config.version}, expected 5.0–5.1. Import may produce unexpected results.`)
        }

        const parseEventDates = (obj: any) => {
            const out: any = { ...obj }
            const dateFields = ['startDate', 'endDate', 'createdAt', 'updatedAt']
            for (const key of dateFields) {
                if (typeof out[key] === 'string') {
                    const d = new Date(out[key])
                    if (!isNaN(d.getTime())) out[key] = d
                }
            }
            return out
        }

        // 1. System settings
        if (config.system) {
            const { geminiApiKey, defaultTags, defaultMeetingTypes, defaultAttendeeTypes } = config.system
            const existing = await prisma.systemSettings.findFirst()
            const data = {
                geminiApiKey,
                defaultTags: defaultTags ?? [],
                defaultMeetingTypes: defaultMeetingTypes ?? [],
                defaultAttendeeTypes: defaultAttendeeTypes ?? [],
            }
            if (existing) {
                await prisma.systemSettings.update({ where: { id: existing.id }, data })
            } else {
                await prisma.systemSettings.create({ data })
            }
        }

        // 2. Companies — upsert by name
        const companyNameToId = new Map<string, string>()
        if (config.companies && Array.isArray(config.companies)) {
            for (const comp of config.companies) {
                try {
                    const upserted = await prisma.company.upsert({
                        where: { name: comp.name },
                        create: { name: comp.name, description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                        update: { description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                    })
                    companyNameToId.set(comp.name, upserted.id)
                } catch (e) {
                    warnings.push(`Company '${comp.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 3. Events — upsert by name, resolve authorizedEmails → authorizedUserIds
        const eventNameToId = new Map<string, string>()
        if (config.events && Array.isArray(config.events)) {
            for (const evt of config.events) {
                try {
                    const parsed = parseEventDates(evt)
                    const { id: _id, roiTargets, marketingChecklist: _mc, linkedInDrafts: _li, authorizedEmails, ...eventFields } = parsed

                    // Resolve authorizedEmails → authorizedUserIds
                    let authorizedUserIds: string[] = []
                    if (Array.isArray(authorizedEmails) && authorizedEmails.length > 0) {
                        const { resolved, missing } = await emailsToUserIds(authorizedEmails)
                        authorizedUserIds = resolved.map((r: { userId: string }) => r.userId)
                        for (const email of missing) {
                            warnings.push(`Event '${evt.name}': authorized user '${email}' not found in Clerk — skipped`)
                        }
                    }

                    // Geocode if needed
                    if (eventFields.address && !eventFields.latitude) {
                        try {
                            const geo = await geocodeAddress(eventFields.address)
                            if (geo) { eventFields.latitude = geo.latitude; eventFields.longitude = geo.longitude }
                        } catch { /* non-fatal */ }
                    }

                    // Resolve slug collision for both create and update paths
                    const resolveSlug = async (desiredSlug: string, excludeId?: string): Promise<string> => {
                        if (!desiredSlug) return desiredSlug
                        const conflict = await prisma.event.findFirst({
                            where: { slug: desiredSlug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }
                        })
                        return conflict ? `${desiredSlug}-${Math.random().toString(36).slice(2, 7)}` : desiredSlug
                    }

                    const existing = await prisma.event.findFirst({ where: { name: eventFields.name } })
                    let eventId: string
                    if (existing) {
                        const slug = await resolveSlug(eventFields.slug, existing.id)
                        await prisma.event.update({
                            where: { id: existing.id },
                            data: { ...eventFields, slug, authorizedUserIds },
                        })
                        eventId = existing.id
                    } else {
                        const slug = await resolveSlug(eventFields.slug)
                        const created = await prisma.event.create({
                            data: { ...eventFields, slug, authorizedUserIds },
                        })
                        eventId = created.id
                    }
                    eventNameToId.set(eventFields.name, eventId)
                } catch (e) {
                    warnings.push(`Event '${evt.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 4. Rooms — resolve eventName → eventId, upsert by (name, eventId)
        const roomKeyToId = new Map<string, string>() // key: `${eventName}::${roomName}`
        if (config.rooms && Array.isArray(config.rooms)) {
            for (const room of config.rooms) {
                try {
                    const eventId = eventNameToId.get(room.eventName)
                    if (!eventId) {
                        warnings.push(`Room '${room.name}': event '${room.eventName}' not found — skipped`)
                        continue
                    }
                    const existing = await prisma.room.findFirst({ where: { name: room.name, eventId } })
                    let roomId: string
                    if (existing) {
                        await prisma.room.update({ where: { id: existing.id }, data: { capacity: room.capacity } })
                        roomId = existing.id
                    } else {
                        const created = await prisma.room.create({ data: { name: room.name, capacity: room.capacity, eventId } })
                        roomId = created.id
                    }
                    roomKeyToId.set(`${room.eventName}::${room.name}`, roomId)
                } catch (e) {
                    warnings.push(`Room '${room.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 5. Attendees — resolve companyName → companyId, upsert by email
        const emailToAttendeeId = new Map<string, string>()
        if (config.attendees && Array.isArray(config.attendees)) {
            for (const att of config.attendees) {
                try {
                    let companyId = companyNameToId.get(att.companyName)
                    if (!companyId && att.companyName) {
                        // Create company on-the-fly if missing
                        const co = await prisma.company.upsert({
                            where: { name: att.companyName },
                            create: { name: att.companyName },
                            update: {},
                        })
                        companyId = co.id
                        companyNameToId.set(att.companyName, companyId)
                    }
                    if (!companyId) {
                        warnings.push(`Attendee '${att.email}': no companyName — skipped`)
                        continue
                    }

                    // Resolve eventNames array (or fallback to single eventName) → event connects
                    const eventNameList: string[] = att.eventNames ?? (att.eventName ? [att.eventName] : [])
                    const eventConnects = eventNameList
                        .map((name: string) => eventNameToId.get(name))
                        .filter((id): id is string => !!id)
                        .map((id: string) => ({ id }))

                    const upserted = await prisma.attendee.upsert({
                        where: { email: att.email },
                        create: {
                            name: att.name, email: att.email, title: att.title ?? '',
                            emailMissing: att.emailMissing ?? false,
                            companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                            imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                            type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                            events: eventConnects.length ? { connect: eventConnects } : undefined,
                        },
                        update: {
                            name: att.name, title: att.title ?? '',
                            emailMissing: att.emailMissing ?? false,
                            companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                            imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                            type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                            events: eventConnects.length ? { connect: eventConnects } : undefined,
                        },
                    })
                    emailToAttendeeId.set(att.email, upserted.id)
                } catch (e) {
                    warnings.push(`Attendee '${att.email}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 6. Meetings — upsert by (title, date, startTime, eventId)
        if (config.meetings && Array.isArray(config.meetings)) {
            for (const mtg of config.meetings) {
                try {
                    const eventId = eventNameToId.get(mtg.eventName)
                    if (!eventId) {
                        warnings.push(`Meeting '${mtg.title}': event '${mtg.eventName}' not found — skipped`)
                        continue
                    }

                    const roomId = mtg.room
                        ? roomKeyToId.get(`${mtg.eventName}::${mtg.room}`) ?? null
                        : null

                    const attendeeConnects = (mtg.attendees ?? [])
                        .map((email: string) => emailToAttendeeId.get(email))
                        .filter(Boolean)
                        .map((id: string) => ({ id }))

                    const existing = await prisma.meeting.findFirst({
                        where: { title: mtg.title, date: mtg.date, startTime: mtg.startTime, eventId }
                    })

                    const commonFields = {
                        title: mtg.title, purpose: mtg.purpose ?? null,
                        date: mtg.date, startTime: mtg.startTime, endTime: mtg.endTime,
                        sequence: mtg.sequence ?? 0, status: mtg.status ?? 'PIPELINE',
                        tags: mtg.tags ?? [], meetingType: mtg.meetingType ?? null,
                        location: mtg.location ?? null, otherDetails: mtg.otherDetails ?? null,
                        isApproved: mtg.isApproved ?? false,
                        calendarInviteSent: mtg.calendarInviteSent ?? false,
                        createdBy: mtg.createdBy ?? null, requesterEmail: mtg.requesterEmail ?? null,
                        roomId, eventId,
                    }

                    if (existing) {
                        await prisma.meeting.update({
                            where: { id: existing.id },
                            data: { ...commonFields, attendees: { set: attendeeConnects } },
                        })
                    } else {
                        await prisma.meeting.create({
                            data: { ...commonFields, attendees: { connect: attendeeConnects } },
                        })
                    }
                } catch (e) {
                    warnings.push(`Meeting '${mtg.title}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 6b. Restore Attendee-Event join from meeting attendees
        // For each meeting, ensure all its attendees are connected to the event
        const eventAttendeeConnects = new Map<string, Set<string>>() // eventId -> Set<attendeeId>
        if (config.meetings && Array.isArray(config.meetings)) {
            for (const mtg of config.meetings) {
                const eventId = eventNameToId.get(mtg.eventName)
                if (!eventId) continue
                const attendeeIds = (mtg.attendees ?? [])
                    .map((email: string) => emailToAttendeeId.get(email))
                    .filter(Boolean) as string[]
                if (!eventAttendeeConnects.has(eventId)) {
                    eventAttendeeConnects.set(eventId, new Set())
                }
                for (const aid of attendeeIds) {
                    eventAttendeeConnects.get(eventId)!.add(aid)
                }
            }
        }
        for (const [eventId, attendeeIds] of eventAttendeeConnects) {
            try {
                await prisma.event.update({
                    where: { id: eventId },
                    data: { attendees: { connect: Array.from(attendeeIds).map(id => ({ id })) } },
                })
            } catch (e) {
                warnings.push(`Event attendee join for event: failed — ${(e as Error).message}`)
            }
        }

        // 7. ROI Targets — upsert per event
        if (config.events && Array.isArray(config.events)) {
            for (const evt of config.events) {
                if (!evt.roiTargets) continue
                const eventId = eventNameToId.get(evt.name)
                if (!eventId) continue
                try {
                    const roi = evt.roiTargets
                    const targetCompanyConnect = await Promise.all(
                        (roi.targetCompanyNames ?? []).map(async (name: string) => {
                            let id = companyNameToId.get(name)
                            if (!id) {
                                const co = await prisma.company.upsert({
                                    where: { name }, create: { name }, update: {},
                                })
                                id = co.id
                            }
                            return { id }
                        })
                    )

                    const roiData = {
                        expectedPipeline: roi.expectedPipeline ?? null,
                        winRate: roi.winRate ?? null,
                        expectedRevenue: roi.expectedRevenue ?? null,
                        targetCustomerMeetings: roi.targetCustomerMeetings ?? null,
                        targetErta: roi.targetErta ?? null,
                        targetSpeaking: roi.targetSpeaking ?? null,
                        targetMediaPR: roi.targetMediaPR ?? null,
                        marketingPlan: roi.marketingPlan ?? null,
                        actualErta: roi.actualErta ?? null,
                        actualSpeaking: roi.actualSpeaking ?? null,
                        actualMediaPR: roi.actualMediaPR ?? null,
                        status: roi.status ?? 'DRAFT',
                        approvedBy: roi.approvedBy ?? null,
                        approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null,
                        submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null,
                        rejectedBy: roi.rejectedBy ?? null,
                        rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null,
                    }

                    await prisma.eventROITargets.upsert({
                        where: { eventId },
                        create: { event: { connect: { id: eventId } }, ...roiData, targetCompanies: { connect: targetCompanyConnect } },
                        update: { ...roiData, targetCompanies: { set: targetCompanyConnect } },
                    })
                } catch (e) {
                    warnings.push(`ROI targets for '${evt.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 8. LinkedIn Drafts — nested per event
        if (config.events && Array.isArray(config.events)) {
            for (const evt of config.events) {
                if (!evt.linkedInDrafts || !Array.isArray(evt.linkedInDrafts)) continue
                const eventId = eventNameToId.get(evt.name)
                if (!eventId) continue
                for (const draft of evt.linkedInDrafts) {
                    try {
                        const draftData = {
                            companyIds: draft.companyIds ?? [],
                            companyNames: draft.companyNames ?? [],
                            content: draft.content ?? '',
                            originalContent: draft.originalContent ?? null,
                            angle: draft.angle ?? '',
                            tone: draft.tone ?? '',
                            articleType: draft.articleType ?? null,
                            status: draft.status ?? 'DRAFT',
                            createdBy: draft.createdBy ?? '',
                            impressions: draft.impressions ?? null,
                            clicks: draft.clicks ?? null,
                            adStartDate: draft.adStartDate ? new Date(draft.adStartDate) : null,
                            adEndDate: draft.adEndDate ? new Date(draft.adEndDate) : null,
                            ctaUrl: draft.ctaUrl ?? null,
                            averageCtr: draft.averageCtr ?? null,
                            averageCpc: draft.averageCpc ?? null,
                            topCompaniesByEngagement: draft.topCompaniesByEngagement ?? null,
                        }
                        if (draft.id) {
                            await prisma.linkedInDraft.upsert({
                                where: { id: draft.id },
                                create: { id: draft.id, eventId, ...draftData, ...(draft.createdAt ? { createdAt: new Date(draft.createdAt) } : {}) },
                                update: { ...draftData },
                            })
                        } else {
                            await prisma.linkedInDraft.create({ data: { eventId, ...draftData } })
                        }
                    } catch (e) {
                        warnings.push(`LinkedIn draft for event '${evt.name}': import failed — ${(e as Error).message}`)
                    }
                }
            }
        }

        // 9. Marketing Checklist — nested per event
        if (config.events && Array.isArray(config.events)) {
            for (const evt of config.events) {
                if (!evt.marketingChecklist) continue
                const eventId = eventNameToId.get(evt.name)
                if (!eventId) continue
                try {
                    const { id: _id, eventId: _eid, createdAt: _ca, updatedAt: _ua, event: _ev, ...checklistData } = evt.marketingChecklist
                    await prisma.eventMarketingChecklist.upsert({
                        where: { eventId },
                        create: { eventId, ...checklistData },
                        update: checklistData,
                    })
                } catch (e) {
                    warnings.push(`Marketing checklist for '${evt.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 10. Intelligence Subscriptions — top-level, name/email-based
        if (config.intelligenceSubscriptions && Array.isArray(config.intelligenceSubscriptions)) {
            for (const s of config.intelligenceSubscriptions) {
                try {
                    let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId: s.userId } })
                    if (!sub) {
                        sub = await prisma.intelligenceSubscription.create({
                            data: { userId: s.userId, email: s.email, active: s.active ?? true },
                        }).catch(() => null)
                    } else {
                        await prisma.intelligenceSubscription.update({
                            where: { id: sub.id },
                            data: { email: s.email, active: s.active ?? true },
                        }).catch(() => {})
                    }
                    if (!sub) {
                        warnings.push(`Intelligence sub for user '${s.userId}': could not create — skipped`)
                        continue
                    }

                    for (const email of (s.selectedAttendeeEmails ?? [])) {
                        const aid = emailToAttendeeId.get(email)
                        if (!aid) continue
                        await prisma.intelligenceSubAttendee.upsert({
                            where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId: aid } },
                            create: { subscriptionId: sub.id, attendeeId: aid },
                            update: {},
                        }).catch(() => {})
                    }

                    for (const name of (s.selectedCompanyNames ?? [])) {
                        const cid = companyNameToId.get(name)
                        if (!cid) continue
                        await prisma.intelligenceSubCompany.upsert({
                            where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId: cid } },
                            create: { subscriptionId: sub.id, companyId: cid },
                            update: {},
                        }).catch(() => {})
                    }

                    for (const name of (s.selectedEventNames ?? [])) {
                        const eid = eventNameToId.get(name)
                        if (!eid) continue
                        await prisma.intelligenceSubEvent.upsert({
                            where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId: eid } },
                            create: { subscriptionId: sub.id, eventId: eid },
                            update: {},
                        }).catch(() => {})
                    }
                } catch (e) {
                    warnings.push(`Intelligence sub for user '${s.userId}': import failed — ${(e as Error).message}`)
                }
            }
        }

        return NextResponse.json({ success: true, warnings })
    } catch (error) {
        console.error('Import error:', error)
        return NextResponse.json({ error: 'Failed to import data' }, { status: 500 })
    }
}, { requireRole: 'root' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = postHandler as any
