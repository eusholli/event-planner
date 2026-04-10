'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { JSDOM } from 'jsdom'
import prisma from '@/lib/prisma'
import { geocodeAddress } from '@/lib/geocoding'

export async function generateEventDetails(url: string, currentData?: any) {
    try {
        console.log(`Generating details for Event: "${currentData?.name || 'Unknown'}" (URL: ${url})`)

        // 3. Call Gemini
        const settings = await prisma.systemSettings.findFirst()
        const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY

        if (!apiKey) {
            return { debug: 'Gemini API Key not configured in System Settings.' }
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: 'gemini-3.1-flash-lite-preview',
            // @ts-ignore
            tools: [{ googleSearch: {} }]
        })

        const hasUrl = url && url.length > 5
        const hasName = currentData?.name && currentData.name.length > 2

        if (!hasUrl && !hasName) {
            return { debug: 'Insufficient data. Please provide at least an Event URL or Event Name.' }
        }

        const prompt = `
        You are an event data expert. validated details are needed for an event.
        
        Target Event URL: ${hasUrl ? url : 'Not provided, rely on Event Name and Context.'}
        ${currentData?.name ? `Event Name Hint: ${currentData.name}` : ''}
        
        Existing Known Data (Context):
        ${currentData ? JSON.stringify(currentData, null, 2) : 'None'}

        Task:
        1. Analyze the available data (URL, Name, Context) to identify the specific event.
        2. USE THE GOOGLE SEARCH TOOL to find the latest official details for this event. This is CRITICAL if the event is in the future.
        3. If the URL is provided, prioritize it. 
        4. If the URL is missing, use the 'Event Name Hint' and 'Existing Known Data' (like City, Date) to identify the event from your internal knowledge base and GOOGLE SEARCH.
        
        Return a JSON object ONLY with the following fields (if found/inferred, else null):
        - name (string) - The official event name.
        - startDate (YYYY-MM-DD)
        - endDate (YYYY-MM-DD)
        - location (string: City, Country)
        - address (string: Full venue address if known)
        - region (string: One of NA, SA, EU/UK, MEA, APAC, Japan. Infer from location.)
        - description (string: Brief summary of the event)
        - budget (number: Estimated typical budget for attending/sponsoring if inferable, else 0)
        - targetCustomers (string: Summary of who attends/targets)

        - tags (string[]: List of relevant keywords/tags)
        - meetingTypes (string[]: Suggested meeting types e.g. "Networking", "Sales", "Keynote")
        - attendeeTypes (string[]: Suggested attendee types to target e.g. "CTO", "Buyer", "Developer")
        - debug (string: A short sentence explaining how you found this info, e.g. "Found via Google Search" or "Inferred from URL")
        
        JSON Format:
        `

        const result = await model.generateContent(prompt)
        const text = result.response.text()

        // Robust JSON extraction: Find start and count braces to find end
        let jsonStr = text
        const firstOpen = text.indexOf('{')

        if (firstOpen !== -1) {
            let braceCount = 0
            let lastClose = -1
            for (let i = firstOpen; i < text.length; i++) {
                if (text[i] === '{') braceCount++
                else if (text[i] === '}') braceCount--

                if (braceCount === 0) {
                    lastClose = i
                    break
                }
            }

            if (lastClose !== -1) {
                jsonStr = text.substring(firstOpen, lastClose + 1)
            }
        }

        return JSON.parse(jsonStr)

    } catch (error: any) {
        console.error('Generation failed:', error)
        return {
            debug: `Internal Error: ${error.message}`
        }
    }
}

// Helper: Resolve a company by name, creating if needed
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

// Data Management Actions
export async function exportEventData(eventId: string) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    const { userIdsToEmails } = await import('@/lib/clerk-export')

    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            attendees: { include: { company: true } },
            rooms: true,
            meetings: { include: { attendees: true, room: true } },
            roiTargets: { include: { targetCompanies: true } },
            linkedInDrafts: true,
            marketingChecklist: true
        }
    })
    if (!event) throw new Error('Event not found')

    // Collect unique companies from this event's attendees + ROI targets
    const companyMap = new Map<string, any>()
    event.attendees.forEach(att => {
        if (!companyMap.has(att.company.id)) companyMap.set(att.company.id, att.company)
    })
    if (event.roiTargets?.targetCompanies) {
        event.roiTargets.targetCompanies.forEach(comp => {
            if (!companyMap.has(comp.id)) companyMap.set(comp.id, comp)
        })
    }

    // Build lookup maps for name resolution
    const attendeeIdToEmail = new Map(event.attendees.map(a => [a.id, a.email]))

    // Translate authorizedUserIds → authorizedEmails (throws on Clerk failure)
    const authorizedEmails = await userIdsToEmails(event.authorizedUserIds ?? [])

    // Companies: strip id
    const companiesOut = Array.from(companyMap.values()).map(c => ({
        name: c.name, description: c.description, pipelineValue: c.pipelineValue,
    }))

    // Event: strip id, authorizedUserIds → authorizedEmails
    const { id, password: _pw, authorizedUserIds, attendees: _atts, rooms: _rooms, meetings: _mtgs, roiTargets: _roi, marketingChecklist: _mc, ...eventRest } = event as any
    const eventOut = { ...eventRest, authorizedEmails }

    // Attendees: strip id/companyId, add companyName
    const attendeesOut = event.attendees.map(att => {
        const { id, companyId, company, ...rest } = att as any
        return { ...rest, companyName: company.name }
    })

    // Rooms: strip id/eventId
    const roomsOut = event.rooms.map(r => {
        const { id, eventId, ...rest } = r as any
        return rest
    })

    // Meetings: strip id/eventId/roomId, room → name, attendees → emails
    const meetingsOut = event.meetings.map(mtg => {
        const { id, eventId, roomId, room, attendees, ...rest } = mtg as any
        return {
            ...rest,
            room: room?.name ?? null,
            attendees: attendees.map((a: any) => attendeeIdToEmail.get(a.id) ?? a.email),
        }
    })

    // ROI targets: strip id/eventId, targetCompanyIds → targetCompanyNames
    const roiOut = event.roiTargets ? (() => {
        const { id: _id, eventId: _eid, event: _ev, targetCompanies, targetCompanyIds: _tcids, ...roiRest } = event.roiTargets as any
        return { ...roiRest, targetCompanyNames: (targetCompanies ?? []).map((c: any) => c.name) }
    })() : null

    // LinkedIn drafts: strip id/eventId (no ID translation needed — companyNames is denormalized)
    const linkedInDraftsOut = event.linkedInDrafts.map(({ id: _id, eventId: _eid, ...rest }) => rest)

    // Marketing checklist: strip id/eventId
    const checklistOut = event.marketingChecklist ? (() => {
        const { id: _id, eventId: _eid, ...rest } = event.marketingChecklist as any
        return rest
    })() : null

    // Intelligence subscriptions (already event-scoped — translate IDs to names)
    const eventAttendeeIds = event.attendees.map(a => a.id)
    const relatedSubs = await prisma.intelligenceSubscription.findMany({
        where: {
            OR: [
                { selectedEvents: { some: { eventId: event.id } } },
                { selectedAttendees: { some: { attendeeId: { in: eventAttendeeIds } } } },
            ],
        },
        include: {
            selectedAttendees: { select: { attendeeId: true } },
            selectedCompanies: { select: { companyId: true, company: { select: { name: true } } } },
            selectedEvents: { select: { eventId: true, event: { select: { name: true } } } },
        },
    })

    const intelligenceSubscriptions = relatedSubs.map(s => ({
        userId: s.userId,
        email: s.email,
        active: s.active,
        selectedAttendeeEmails: s.selectedAttendees
            .filter(r => eventAttendeeIds.includes(r.attendeeId))
            .map(r => attendeeIdToEmail.get(r.attendeeId))
            .filter((e): e is string => !!e),
        selectedCompanyNames: s.selectedCompanies.map(r => r.company.name),
        selectedEventNames: s.selectedEvents
            .filter(r => r.eventId === event.id)
            .map(r => r.event.name),
    }))

    return {
        event: eventOut,
        companies: companiesOut,
        attendees: attendeesOut,
        rooms: roomsOut,
        meetings: meetingsOut,
        roiTargets: roiOut,
        linkedInDrafts: linkedInDraftsOut,
        marketingChecklist: checklistOut,
        intelligenceSubscriptions,
        exportedAt: new Date().toISOString(),
        version: '5.2',
    }
}

export async function deleteEventData(eventId: string) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    await prisma.event.delete({
        where: { id: eventId }
    })
    return { success: true }
}

export async function resetEventData(eventId: string) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    // Delete children only
    await prisma.$transaction([
        prisma.meeting.deleteMany({ where: { eventId } }),
        prisma.event.update({
            where: { id: eventId },
            data: { attendees: { set: [] } }
        }),
        prisma.room.deleteMany({ where: { eventId } })
    ])

    return { success: true }
}

export async function importEventData(eventId: string, data: any) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    const warnings: string[] = []

    const supportedVersions = ['5.0', '5.1', '5.2']
    if (data.version && !supportedVersions.includes(data.version)) {
        warnings.push(`File version is ${data.version}, expected 5.0–5.2.`)
    }

    // Scope check: warn if event name doesn't match
    if (data.event?.name) {
        const targetEvent = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } })
        if (targetEvent && targetEvent.name !== data.event.name) {
            warnings.push(`Importing data from event '${data.event.name}' into event '${targetEvent.name}'.`)
        }
    }

    // 1. Companies — upsert by name
    const companyNameToId = new Map<string, string>()
    if (data.companies && Array.isArray(data.companies)) {
        for (const comp of data.companies) {
            try {
                const upserted = await prisma.company.upsert({
                    where: { name: comp.name },
                    create: { name: comp.name, description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                    update: { description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                })
                companyNameToId.set(comp.name, upserted.id)
            } catch (e) {
                warnings.push(`Company '${comp.name}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 2. Event update (merge)
    if (data.event) {
        const { authorizedEmails, roiTargets: _roi, id: _id, slug: _slug, name: _name, ...eventFields } = data.event
        const eventUpdate: any = { ...eventFields }

        // Resolve authorizedEmails → authorizedUserIds
        if (Array.isArray(authorizedEmails)) {
            const { emailsToUserIds } = await import('@/lib/clerk-export')
            const { resolved, missing } = await emailsToUserIds(authorizedEmails)
            eventUpdate.authorizedUserIds = resolved.map(r => r.userId)
            for (const email of missing) {
                warnings.push(`Authorized user '${email}' not found in Clerk — skipped`)
            }
        }

        // Geocode if needed
        if (eventFields.address && !eventFields.latitude) {
            try {
                const geo = await geocodeAddress(eventFields.address)
                if (geo) { eventUpdate.latitude = geo.latitude; eventUpdate.longitude = geo.longitude }
            } catch { /* non-fatal */ }
        }

        try {
            await prisma.event.update({ where: { id: eventId }, data: eventUpdate })
        } catch (e) {
            warnings.push(`Event metadata update failed — ${(e as Error).message}`)
        }
    }

    // 3. Rooms — upsert by (name, eventId), build roomNameToId map
    const roomNameToId = new Map<string, string>()
    if (data.rooms && Array.isArray(data.rooms)) {
        for (const room of data.rooms) {
            try {
                const existing = await prisma.room.findFirst({ where: { name: room.name, eventId } })
                let roomId: string
                if (existing) {
                    await prisma.room.update({ where: { id: existing.id }, data: { capacity: room.capacity } })
                    roomId = existing.id
                } else {
                    const created = await prisma.room.create({ data: { name: room.name, capacity: room.capacity, eventId } })
                    roomId = created.id
                }
                roomNameToId.set(room.name, roomId)
            } catch (e) {
                warnings.push(`Room '${room.name}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 4. Attendees — upsert by email, resolve companyName, build emailToAttendeeId map
    const emailToAttendeeId = new Map<string, string>()
    if (data.attendees && Array.isArray(data.attendees)) {
        for (const att of data.attendees) {
            try {
                // Resolve company: companyName (V5) or legacy att.company string
                const nameForCompany = att.companyName ?? att.company
                let companyId = companyNameToId.get(nameForCompany)
                if (!companyId && nameForCompany) {
                    companyId = await resolveCompany(nameForCompany, att.companyDescription)
                    if (companyId) companyNameToId.set(nameForCompany, companyId)
                }
                if (!companyId) {
                    warnings.push(`Attendee '${att.email}': no company — skipped`)
                    continue
                }

                const upserted = await prisma.attendee.upsert({
                    where: { email: att.email },
                    create: {
                        name: att.name, email: att.email, title: att.title ?? '',
                        companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                        imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                        type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                        events: { connect: { id: eventId } },
                    },
                    update: {
                        name: att.name, title: att.title ?? '',
                        companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                        imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                        type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                        events: { connect: { id: eventId } },
                    },
                })
                emailToAttendeeId.set(att.email, upserted.id)
            } catch (e) {
                warnings.push(`Attendee '${att.email}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 5. Meetings — upsert by (title, date, startTime, eventId)
    if (data.meetings && Array.isArray(data.meetings)) {
        for (const mtg of data.meetings) {
            try {
                const roomId = mtg.room ? (roomNameToId.get(mtg.room) ?? null) : null
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
                warnings.push(`Meeting '${mtg.title}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 6. ROI Targets
    if (data.roiTargets) {
        try {
            const roi = data.roiTargets
            const targetCompanyConnect = (await Promise.allSettled(
                (roi.targetCompanyNames ?? []).map(async (name: string) => {
                    // Use in-memory map first to avoid redundant DB lookup
                    let id = companyNameToId.get(name)
                    if (!id) {
                        try {
                            id = await resolveCompany(name)
                        } catch {
                            warnings.push(`ROI target company '${name}': could not resolve — skipped`)
                            return null
                        }
                    }
                    return { id }
                })
            )).flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : [])

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
            warnings.push(`ROI targets: failed — ${(e as Error).message}`)
        }
    }

    // 7. LinkedIn Drafts
    if (data.linkedInDrafts && Array.isArray(data.linkedInDrafts)) {
        for (const draft of data.linkedInDrafts) {
            try {
                await prisma.linkedInDraft.create({
                    data: {
                        eventId,
                        companyIds: draft.companyIds ?? [],
                        companyNames: draft.companyNames ?? [],
                        content: draft.content ?? '',
                        originalContent: draft.originalContent ?? null,
                        angle: draft.angle ?? '',
                        tone: draft.tone ?? '',
                        articleType: draft.articleType ?? null,
                        status: draft.status ?? 'DRAFT',
                        createdBy: draft.createdBy ?? '',
                        ...(draft.createdAt ? { createdAt: new Date(draft.createdAt) } : {}),
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
                })
            } catch (e) {
                warnings.push(`LinkedIn draft: import failed — ${(e as Error).message}`)
            }
        }
    }

    // 8. Marketing Checklist
    if (data.marketingChecklist) {
        try {
            const { id: _id, eventId: _eid, createdAt: _ca, updatedAt: _ua, ...checklistData } = data.marketingChecklist
            await prisma.eventMarketingChecklist.upsert({
                where: { eventId },
                create: { eventId, ...checklistData },
                update: checklistData,
            })
        } catch (e) {
            warnings.push(`Marketing checklist: failed — ${(e as Error).message}`)
        }
    }

    // 9. Intelligence subscriptions
    if (data.intelligenceSubscriptions && Array.isArray(data.intelligenceSubscriptions)) {
        for (const s of data.intelligenceSubscriptions) {
            try {
                let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId: s.userId } })
                if (!sub) {
                    sub = await prisma.intelligenceSubscription.create({
                        data: { userId: s.userId, email: s.email, active: s.active ?? true },
                    }).catch(() => null)
                }
                if (!sub) {
                    warnings.push(`Intelligence sub for user '${s.userId}': could not create subscription — skipped`)
                    continue
                }

                // Restore event selections
                await prisma.intelligenceSubEvent.upsert({
                    where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } },
                    create: { subscriptionId: sub.id, eventId },
                    update: {},
                }).catch(() => { })

                // Restore attendee selections — resolve emails → IDs
                for (const email of (s.selectedAttendeeEmails ?? [])) {
                    const aid = emailToAttendeeId.get(email)
                    if (!aid) continue
                    await prisma.intelligenceSubAttendee.upsert({
                        where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId: aid } },
                        create: { subscriptionId: sub.id, attendeeId: aid },
                        update: {},
                    }).catch(() => { })
                }

                // Restore company selections — resolve names → IDs
                for (const name of (s.selectedCompanyNames ?? [])) {
                    const cid = companyNameToId.get(name)
                    if (!cid) continue
                    await prisma.intelligenceSubCompany.upsert({
                        where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId: cid } },
                        create: { subscriptionId: sub.id, companyId: cid },
                        update: {},
                    }).catch(() => { })
                }

                // Restore event name selections (other events beyond the current one)
                for (const eventName of (s.selectedEventNames ?? [])) {
                    const eid = await prisma.event.findFirst({ where: { name: eventName }, select: { id: true } })
                        .then(e => e?.id)
                    if (!eid) continue
                    await prisma.intelligenceSubEvent.upsert({
                        where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId: eid } },
                        create: { subscriptionId: sub.id, eventId: eid },
                        update: {},
                    }).catch(() => { })
                }
            } catch (e) {
                warnings.push(`Intelligence sub for user '${s.userId}': failed — ${(e as Error).message}`)
            }
        }

        // Recompute subscriptionCounts
        for (const [, aid] of emailToAttendeeId) {
            const count = await prisma.intelligenceSubAttendee.count({ where: { attendeeId: aid } })
            await prisma.attendee.update({ where: { id: aid }, data: { subscriptionCount: count } }).catch(() => { })
        }
        const eventSubCount = await prisma.intelligenceSubEvent.count({ where: { eventId } })
        await prisma.event.update({ where: { id: eventId }, data: { subscriptionCount: eventSubCount } }).catch(() => { })
        for (const [, cid] of companyNameToId) {
            const count = await prisma.intelligenceSubCompany.count({ where: { companyId: cid } })
            await prisma.company.update({ where: { id: cid }, data: { subscriptionCount: count } }).catch(() => { })
        }
    }

    return { success: true, warnings }
}
