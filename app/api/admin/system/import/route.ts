import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/lib/with-auth'
import { geocodeAddress } from '@/lib/geocoding'
import { emailsToUserIds } from '@/lib/clerk-export'

export const dynamic = 'force-dynamic'

// Helper: Resolve a company by name or ID, creating if needed
async function resolveCompany(companyName: string, description?: string, pipelineValue?: number | null): Promise<string> {
    const existing = await prisma.company.findUnique({ where: { name: companyName } })
    if (existing) {
        return existing.id
    }
    const created = await prisma.company.create({
        data: {
            name: companyName,
            description: description || null,
            pipelineValue: pipelineValue || null,
        }
    })
    return created.id
}

// ─── V5 import (name-based, no UUIDs) ────────────────────────────────────────

async function importV5(json: any): Promise<{ warnings: string[] }> {
    const warnings: string[] = []

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
    if (json.system) {
        const { geminiApiKey, defaultTags, defaultMeetingTypes, defaultAttendeeTypes } = json.system
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
    if (json.companies && Array.isArray(json.companies)) {
        for (const comp of json.companies) {
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
    if (json.events && Array.isArray(json.events)) {
        for (const evt of json.events) {
            try {
                const parsed = parseEventDates(evt)
                const { id: _id, roiTargets, authorizedEmails, ...eventFields } = parsed

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

                // Resolve slug collision
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
    const roomKeyToId = new Map<string, string>()
    if (json.rooms && Array.isArray(json.rooms)) {
        for (const room of json.rooms) {
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
    if (json.attendees && Array.isArray(json.attendees)) {
        for (const att of json.attendees) {
            try {
                let companyId = companyNameToId.get(att.companyName)
                if (!companyId && att.companyName) {
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

                const eventNameList: string[] = att.eventNames ?? (att.eventName ? [att.eventName] : [])
                const eventConnects = eventNameList
                    .map((name: string) => eventNameToId.get(name))
                    .filter((id): id is string => !!id)
                    .map((id: string) => ({ id }))

                const upserted = await prisma.attendee.upsert({
                    where: { email: att.email },
                    create: {
                        name: att.name, email: att.email, title: att.title ?? '',
                        companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                        imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                        type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                        events: eventConnects.length ? { connect: eventConnects } : undefined,
                    },
                    update: {
                        name: att.name, title: att.title ?? '',
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
    if (json.meetings && Array.isArray(json.meetings)) {
        for (const mtg of json.meetings) {
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
    const eventAttendeeConnects = new Map<string, Set<string>>()
    if (json.meetings && Array.isArray(json.meetings)) {
        for (const mtg of json.meetings) {
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
    if (json.events && Array.isArray(json.events)) {
        for (const evt of json.events) {
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

    // 8. Marketing Checklist — nested per event
    if (json.events && Array.isArray(json.events)) {
        for (const evt of json.events) {
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

    // 9. LinkedIn Drafts — nested per event
    if (json.events && Array.isArray(json.events)) {
        for (const evt of json.events) {
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
                        status: draft.status ?? 'DRAFT',
                        createdBy: draft.createdBy ?? '',
                        datePosted: draft.datePosted ? new Date(draft.datePosted) : null,
                        postUrl: draft.postUrl ?? null,
                        impressions: draft.impressions ?? null,
                        uniqueViews: draft.uniqueViews ?? null,
                        clicks: draft.clicks ?? null,
                        reactions: draft.reactions ?? null,
                        comments: draft.comments ?? null,
                        reposts: draft.reposts ?? null,
                        engagementRate: draft.engagementRate ?? null,
                        followsGained: draft.followsGained ?? null,
                        profileVisits: draft.profileVisits ?? null,
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

    return { warnings }
}

// ─── V4 import (ID-based, backwards compatibility) ───────────────────────────

async function importV4(json: any): Promise<void> {
    const { systemSettings, events } = json

    if (systemSettings) {
        const existing = await prisma.systemSettings.findFirst()
        const updateData: any = {}
        if (systemSettings.geminiApiKey !== undefined) updateData.geminiApiKey = systemSettings.geminiApiKey
        if (systemSettings.defaultTags !== undefined) updateData.defaultTags = systemSettings.defaultTags
        if (systemSettings.defaultMeetingTypes !== undefined) updateData.defaultMeetingTypes = systemSettings.defaultMeetingTypes
        if (systemSettings.defaultAttendeeTypes !== undefined) updateData.defaultAttendeeTypes = systemSettings.defaultAttendeeTypes

        if (existing) {
            await prisma.systemSettings.update({ where: { id: existing.id }, data: updateData })
        } else {
            await prisma.systemSettings.create({
                data: {
                    geminiApiKey: systemSettings.geminiApiKey,
                    defaultTags: systemSettings.defaultTags || [],
                    defaultMeetingTypes: systemSettings.defaultMeetingTypes || [],
                    defaultAttendeeTypes: systemSettings.defaultAttendeeTypes || []
                }
            })
        }
    }

    if (json.companies && Array.isArray(json.companies)) {
        for (const comp of json.companies) {
            await prisma.company.upsert({
                where: { id: comp.id },
                create: { id: comp.id, name: comp.name, description: comp.description, pipelineValue: comp.pipelineValue },
                update: { name: comp.name, description: comp.description, pipelineValue: comp.pipelineValue },
            }).catch(e => console.warn('Company import skip', e))
        }
    }

    if (json.attendees && Array.isArray(json.attendees)) {
        for (const att of json.attendees) {
            let companyId = att.companyId
            if (!companyId && att.company && typeof att.company === 'string') {
                companyId = await resolveCompany(att.company, att.companyDescription, att.pipelineValue)
            }
            if (!companyId) { console.warn('Attendee import skip - no companyId:', att.name); continue }

            await prisma.attendee.upsert({
                where: { id: att.id },
                create: { id: att.id, name: att.name, email: att.email, title: att.title, companyId, bio: att.bio, linkedin: att.linkedin, imageUrl: att.imageUrl, isExternal: att.isExternal, type: att.type, seniorityLevel: att.seniorityLevel },
                update: { name: att.name, email: att.email, title: att.title, companyId, bio: att.bio, linkedin: att.linkedin, imageUrl: att.imageUrl, isExternal: att.isExternal, type: att.type, seniorityLevel: att.seniorityLevel },
            }).catch(e => console.warn('Global Attendee import skip', e))
        }
    }

    if (events && Array.isArray(events)) {
        for (const evt of events) {
            const eventUpdate: any = {}
            const fields = ['name','startDate','endDate','status','region','url','budget','targetCustomers','requesterEmail','tags','meetingTypes','attendeeTypes','address','timezone','slug','password','description','authorizedUserIds','boothLocation']
            for (const f of fields) { if (evt[f] !== undefined) eventUpdate[f] = evt[f] }

            let latitude = (evt as any).latitude
            let longitude = (evt as any).longitude
            if (evt.address && (latitude === undefined || longitude === undefined)) {
                try {
                    const geo = await geocodeAddress(evt.address)
                    if (geo) { latitude = geo.latitude; longitude = geo.longitude }
                } catch { /* non-fatal */ }
            }
            if (latitude !== undefined) eventUpdate.latitude = latitude
            if (longitude !== undefined) eventUpdate.longitude = longitude

            let attendeeConnects: any = undefined
            if (evt.attendeeIds && Array.isArray(evt.attendeeIds)) {
                attendeeConnects = evt.attendeeIds.map((id: string) => ({ id }))
            }

            const event = await prisma.event.upsert({
                where: { id: evt.id || 'new_impossible_id' },
                create: {
                    id: evt.id, name: evt.name,
                    slug: evt.slug || (evt.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (evt.id ? evt.id.slice(-5) : Math.random().toString(36).substring(2, 7)),
                    startDate: evt.startDate, endDate: evt.endDate, status: evt.status,
                    region: evt.region, url: evt.url, budget: evt.budget,
                    targetCustomers: evt.targetCustomers, requesterEmail: evt.requesterEmail,
                    tags: evt.tags || [], meetingTypes: evt.meetingTypes || [], attendeeTypes: evt.attendeeTypes || [],
                    address: evt.address, latitude, longitude, timezone: evt.timezone,
                    password: evt.password, description: evt.description,
                    authorizedUserIds: evt.authorizedUserIds || [], boothLocation: evt.boothLocation || '',
                    attendees: attendeeConnects ? { connect: attendeeConnects } : undefined
                },
                update: { ...eventUpdate, attendees: attendeeConnects ? { connect: attendeeConnects } : undefined }
            })

            const eventId = event.id

            if (evt.rooms) {
                for (const room of evt.rooms) {
                    const roomUpdate: any = {}
                    if (room.name !== undefined) roomUpdate.name = room.name
                    if (room.capacity !== undefined) roomUpdate.capacity = room.capacity
                    await prisma.room.upsert({
                        where: { id: room.id },
                        create: { id: room.id, name: room.name, capacity: room.capacity, eventId },
                        update: roomUpdate,
                    }).catch(e => console.warn('Room skip', e))
                }
            }

            if (!json.attendees && evt.attendees) {
                for (const att of evt.attendees) {
                    let companyId = att.companyId
                    if (!companyId && att.company && typeof att.company === 'string') {
                        companyId = await resolveCompany(att.company, att.companyDescription, att.pipelineValue)
                    }
                    if (!companyId) { console.warn('Legacy attendee import skip - no companyId:', att.name); continue }

                    const attUpdate: any = {}
                    for (const f of ['name','email','title','bio','linkedin','imageUrl','isExternal','type','seniorityLevel']) {
                        if (att[f] !== undefined) attUpdate[f] = att[f]
                    }
                    attUpdate.companyId = companyId

                    await prisma.attendee.upsert({
                        where: { id: att.id },
                        create: { id: att.id, name: att.name, email: att.email, title: att.title, companyId, bio: att.bio, linkedin: att.linkedin, imageUrl: att.imageUrl, isExternal: att.isExternal, type: att.type, seniorityLevel: att.seniorityLevel, events: { connect: { id: eventId } } },
                        update: { ...attUpdate, events: { connect: { id: eventId } } },
                    }).catch(e => console.warn('Attendee skip', e))
                }
            }

            if (evt.meetings) {
                for (const mtg of evt.meetings) {
                    let attendeeConnects: any = undefined
                    if (mtg.attendees !== undefined) {
                        attendeeConnects = mtg.attendees?.map((a: any) => {
                            if (typeof a === 'string') return { id: a }
                            return { id: a.id }
                        }) || []
                    }

                    const mtgUpdate: any = {}
                    for (const f of ['title','purpose','date','startTime','endTime','roomId','sequence','status','tags','calendarInviteSent','createdBy','isApproved','meetingType','otherDetails','requesterEmail','location']) {
                        if (mtg[f] !== undefined) mtgUpdate[f] = mtg[f]
                    }
                    if (attendeeConnects !== undefined) mtgUpdate.attendees = { set: attendeeConnects }

                    const createConnects = mtg.attendees?.map((a: any) => {
                        if (typeof a === 'string') return { id: a }
                        return { id: a.id }
                    }) || []

                    await prisma.meeting.upsert({
                        where: { id: mtg.id },
                        create: { id: mtg.id, title: mtg.title, date: mtg.date, startTime: mtg.startTime, endTime: mtg.endTime, eventId, roomId: mtg.roomId, attendees: { connect: createConnects }, sequence: mtg.sequence || 0, status: mtg.status || 'PIPELINE', tags: mtg.tags || [], calendarInviteSent: mtg.calendarInviteSent || false, createdBy: mtg.createdBy, isApproved: mtg.isApproved || false, meetingType: mtg.meetingType, otherDetails: mtg.otherDetails, requesterEmail: mtg.requesterEmail, location: mtg.location, purpose: mtg.purpose },
                        update: mtgUpdate,
                    }).catch(e => console.warn('Meeting skip', e))
                }
            }

            if (evt.roiTargets) {
                const roi = evt.roiTargets
                const targetCustomerMeetings = roi.targetCustomerMeetings ?? roi.targetBoothMeetings ?? null
                const targetErta = roi.targetErta ?? roi.targetTargetedReach ?? roi.targetSocialReach ?? null
                const targetSpeaking = roi.targetSpeaking ?? roi.targetKeynotes ?? null
                const actualErta = roi.actualErta ?? roi.actualTargetedReach ?? roi.actualSocialReach ?? null
                const actualSpeaking = roi.actualSpeaking ?? roi.actualKeynotes ?? null

                let targetCompanyConnect: any = undefined
                if (roi.targetCompanyIds && Array.isArray(roi.targetCompanyIds)) {
                    targetCompanyConnect = roi.targetCompanyIds.map((id: string) => ({ id }))
                } else if (roi.targetCompanies && Array.isArray(roi.targetCompanies)) {
                    const companyIds: string[] = []
                    for (const name of roi.targetCompanies) {
                        if (typeof name === 'string') companyIds.push(await resolveCompany(name))
                    }
                    targetCompanyConnect = companyIds.map(id => ({ id }))
                }

                const roiData = { expectedPipeline: roi.expectedPipeline, winRate: roi.winRate, expectedRevenue: roi.expectedRevenue, targetCustomerMeetings, targetErta, targetSpeaking, targetMediaPR: roi.targetMediaPR, marketingPlan: roi.marketingPlan ?? null, targetCompanies: targetCompanyConnect ? { connect: targetCompanyConnect } : undefined, actualErta, actualSpeaking, actualMediaPR: roi.actualMediaPR, status: roi.status || 'DRAFT', approvedBy: roi.approvedBy ?? null, approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null, submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null, rejectedBy: roi.rejectedBy ?? null, rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null }

                await prisma.eventROITargets.upsert({
                    where: { eventId },
                    create: { event: { connect: { id: eventId } }, ...roiData },
                    update: { ...roiData, targetCompanies: targetCompanyConnect ? { set: targetCompanyConnect } : undefined },
                }).catch(e => console.warn('ROI targets import skip', e))
            }

            if (evt.marketingChecklist) {
                try {
                    const { id: _id, eventId: _eid, createdAt: _ca, updatedAt: _ua, event: _ev, ...checklistData } = evt.marketingChecklist
                    await prisma.eventMarketingChecklist.upsert({
                        where: { eventId },
                        create: { eventId, ...checklistData },
                        update: checklistData,
                    })
                } catch (e) {
                    console.warn('Marketing checklist import skip', e)
                }
            }

            if (evt.linkedInDrafts && Array.isArray(evt.linkedInDrafts)) {
                for (const draft of evt.linkedInDrafts) {
                    const draftData = {
                        companyIds: draft.companyIds ?? [],
                        companyNames: draft.companyNames ?? [],
                        content: draft.content ?? '',
                        originalContent: draft.originalContent ?? null,
                        angle: draft.angle ?? '',
                        tone: draft.tone ?? '',
                        status: draft.status ?? 'DRAFT',
                        createdBy: draft.createdBy ?? '',
                        datePosted: draft.datePosted ? new Date(draft.datePosted) : null,
                        postUrl: draft.postUrl ?? null,
                        impressions: draft.impressions ?? null,
                        uniqueViews: draft.uniqueViews ?? null,
                        clicks: draft.clicks ?? null,
                        reactions: draft.reactions ?? null,
                        comments: draft.comments ?? null,
                        reposts: draft.reposts ?? null,
                        engagementRate: draft.engagementRate ?? null,
                        followsGained: draft.followsGained ?? null,
                        profileVisits: draft.profileVisits ?? null,
                    }
                    if (draft.id) {
                        await prisma.linkedInDraft.upsert({
                            where: { id: draft.id },
                            create: { id: draft.id, eventId, ...draftData, ...(draft.createdAt ? { createdAt: new Date(draft.createdAt) } : {}) },
                            update: { ...draftData },
                        }).catch(e => console.warn('LinkedIn draft import skip', e))
                    } else {
                        await prisma.linkedInDraft.create({ data: { eventId, ...draftData } })
                            .catch(e => console.warn('LinkedIn draft import skip', e))
                    }
                }
            }
        }
    }

    if (json.intelligenceSubscriptions && Array.isArray(json.intelligenceSubscriptions)) {
        for (const s of json.intelligenceSubscriptions) {
            await prisma.intelligenceSubscription.upsert({
                where: { userId: s.userId },
                create: { id: s.id, userId: s.userId, email: s.email, active: s.active ?? true, unsubscribeToken: s.unsubscribeToken ?? undefined },
                update: { email: s.email, active: s.active ?? true },
            }).catch(e => console.warn('IntelligenceSubscription import skip', e))

            const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId: s.userId } })
            if (!sub) continue

            if (s.selectedAttendeeIds) {
                for (const attendeeId of s.selectedAttendeeIds) {
                    const exists = await prisma.attendee.findUnique({ where: { id: attendeeId } })
                    if (!exists) continue
                    await prisma.intelligenceSubAttendee.upsert({ where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId } }, create: { subscriptionId: sub.id, attendeeId }, update: {} }).catch(() => {})
                }
            }
            if (s.selectedCompanyIds) {
                for (const companyId of s.selectedCompanyIds) {
                    const exists = await prisma.company.findUnique({ where: { id: companyId } })
                    if (!exists) continue
                    await prisma.intelligenceSubCompany.upsert({ where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId } }, create: { subscriptionId: sub.id, companyId }, update: {} }).catch(() => {})
                }
            }
            if (s.selectedEventIds) {
                for (const eventId of s.selectedEventIds) {
                    const exists = await prisma.event.findUnique({ where: { id: eventId } })
                    if (!exists) continue
                    await prisma.intelligenceSubEvent.upsert({ where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } }, create: { subscriptionId: sub.id, eventId }, update: {} }).catch(() => {})
                }
            }
        }
    }
}

// ─── Route handler ────────────────────────────────────────────────────────────

async function handlePOST(request: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const json = await request.json()

        // Detect V5 format by version field or by presence of top-level 'system' key
        const isV5 = json.version === '5.0' || (json.system && !json.systemSettings)

        if (isV5) {
            if (json.version && json.version !== '5.0') {
                // version present but not 5.0 — warn but continue
                console.warn(`Import file version is ${json.version}, expected 5.0`)
            }
            const { warnings } = await importV5(json)
            return NextResponse.json({ success: true, warnings, message: 'System restored successfully (V5)' })
        } else {
            await importV4(json)
            return NextResponse.json({ success: true, message: 'System restored successfully' })
        }
    } catch (error) {
        console.error('System import error:', error)
        return NextResponse.json({ error: 'Failed to import system' }, { status: 500 })
    }
}

export const POST = withAuth(handlePOST, { requireRole: 'root' }) as any
