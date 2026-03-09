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
            model: 'gemini-2.0-flash-exp',
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
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            attendees: { include: { meetings: true, company: true } },
            rooms: true,
            meetings: { include: { attendees: true, room: true } },
            roiTargets: { include: { targetCompanies: true } }
        }
    })

    if (!event) throw new Error('Event not found')

    // Collect unique companies from this event's attendees
    const companyMap = new Map<string, any>()
    event.attendees.forEach(att => {
        if (!companyMap.has(att.company.id)) {
            companyMap.set(att.company.id, att.company)
        }
    })

    // Also include target companies from ROI
    if (event.roiTargets?.targetCompanies) {
        event.roiTargets.targetCompanies.forEach(comp => {
            if (!companyMap.has(comp.id)) {
                companyMap.set(comp.id, comp)
            }
        })
    }

    // Normalize attendees (strip meetings and company object, keep companyId)
    const normalizedAttendees = event.attendees.map(attendee => {
        const { meetings, company, ...rest } = attendee
        return rest
    })

    const normalizedMeetings = event.meetings.map(meeting => {
        const { attendees, room, ...rest } = meeting
        return {
            ...rest,
            attendees: attendees.map(a => a.id)
        }
    })

    // Normalize ROI targets
    const roiTargets = event.roiTargets ? (() => {
        const { eventId: _eid, targetCompanies, ...rest } = event.roiTargets
        return {
            ...rest,
            targetCompanyIds: targetCompanies.map(c => c.id)
        }
    })() : null

    // Fetch intelligence subscriptions related to this event or its attendees
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
            selectedCompanies: { select: { companyId: true } },
            selectedEvents: { select: { eventId: true } },
        },
    })

    const intelligenceSubscriptions = relatedSubs.map(s => ({
        userId: s.userId,
        email: s.email,
        active: s.active,
        selectedAttendeeIds: s.selectedAttendees
            .map(r => r.attendeeId)
            .filter(id => eventAttendeeIds.includes(id)),
        selectedCompanyIds: s.selectedCompanies.map(r => r.companyId),
        selectedEventIds: s.selectedEvents
            .map(r => r.eventId)
            .filter(id => id === event.id),
    }))

    return {
        event: {
            ...event,
            meetings: undefined,
            attendees: undefined,
            rooms: undefined,
            roiTargets: undefined
        },
        companies: Array.from(companyMap.values()),
        attendees: normalizedAttendees,
        rooms: event.rooms,
        meetings: normalizedMeetings,
        roiTargets,
        intelligenceSubscriptions,
        exportedAt: new Date().toISOString(),
        version: '4.0'
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

    // 1. Scope Validation
    if (data.event?.id && data.event.id !== eventId) {
        throw new Error(`Invalid Event ID. Data belongs to event ${data.event.id} but you are importing into ${eventId}.`)
    }

    // 1.5 Import Companies first (if present)
    if (data.companies && Array.isArray(data.companies)) {
        for (const comp of data.companies) {
            await prisma.company.upsert({
                where: { id: comp.id },
                create: {
                    id: comp.id,
                    name: comp.name,
                    description: comp.description,
                    pipelineValue: comp.pipelineValue,
                },
                update: {
                    name: comp.name,
                    description: comp.description,
                    pipelineValue: comp.pipelineValue,
                }
            }).catch(e => console.warn('Company import skip', e))
        }
    }

    // 2. Event Update (Merge)
    if (data.event) {
        const eventUpdate: any = {}
        if (data.event.name !== undefined) eventUpdate.name = data.event.name
        if (data.event.startDate !== undefined) eventUpdate.startDate = data.event.startDate
        if (data.event.endDate !== undefined) eventUpdate.endDate = data.event.endDate
        if (data.event.status !== undefined) eventUpdate.status = data.event.status
        if (data.event.region !== undefined) eventUpdate.region = data.event.region
        if (data.event.url !== undefined) eventUpdate.url = data.event.url
        if (data.event.budget !== undefined) eventUpdate.budget = data.event.budget
        if (data.event.targetCustomers !== undefined) eventUpdate.targetCustomers = data.event.targetCustomers
        if (data.event.requesterEmail !== undefined) eventUpdate.requesterEmail = data.event.requesterEmail
        if (data.event.tags !== undefined) eventUpdate.tags = data.event.tags
        if (data.event.meetingTypes !== undefined) eventUpdate.meetingTypes = data.event.meetingTypes
        if (data.event.attendeeTypes !== undefined) eventUpdate.attendeeTypes = data.event.attendeeTypes
        if (data.event.address !== undefined) eventUpdate.address = data.event.address
        if (data.event.timezone !== undefined) eventUpdate.timezone = data.event.timezone
        if (data.event.slug !== undefined) eventUpdate.slug = data.event.slug
        if (data.event.password !== undefined) eventUpdate.password = data.event.password
        if (data.event.description !== undefined) eventUpdate.description = data.event.description
        if (data.event.authorizedUserIds !== undefined) eventUpdate.authorizedUserIds = data.event.authorizedUserIds
        if (data.event.boothLocation !== undefined) eventUpdate.boothLocation = data.event.boothLocation

        // Geocode if address exists but coords are missing
        if (data.event.address && (data.event.latitude === undefined || data.event.longitude === undefined)) {
            try {
                const geo = await geocodeAddress(data.event.address)
                if (geo) {
                    eventUpdate.latitude = geo.latitude
                    eventUpdate.longitude = geo.longitude
                }
            } catch (e) {
                console.error('Event import action geocoding failed', e)
            }
        }

        if (data.event.latitude !== undefined) eventUpdate.latitude = data.event.latitude
        if (data.event.longitude !== undefined) eventUpdate.longitude = data.event.longitude

        await prisma.event.update({
            where: { id: eventId },
            data: eventUpdate
        })
    }

    // 3. Import Rooms
    if (data.rooms && Array.isArray(data.rooms)) {
        for (const room of data.rooms) {
            const roomUpdate: any = {}
            if (room.name !== undefined) roomUpdate.name = room.name
            if (room.capacity !== undefined) roomUpdate.capacity = room.capacity

            await prisma.room.upsert({
                where: { id: room.id },
                create: {
                    id: room.id,
                    name: room.name,
                    capacity: room.capacity,
                    eventId
                },
                update: roomUpdate
            }).catch(e => console.warn('Room import skip', e))
        }
    }

    // 4. Import Attendees
    if (data.attendees && Array.isArray(data.attendees)) {
        for (const att of data.attendees) {
            let companyId = att.companyId

            // Backwards compatibility: If old format with company string
            if (!companyId && att.company && typeof att.company === 'string') {
                companyId = await resolveCompany(att.company, att.companyDescription, att.pipelineValue)
            }

            if (!companyId) {
                console.warn('Attendee import skip - no companyId:', att.name)
                continue
            }

            const attUpdate: any = {}
            if (att.name !== undefined) attUpdate.name = att.name
            if (att.email !== undefined) attUpdate.email = att.email
            if (att.title !== undefined) attUpdate.title = att.title
            attUpdate.companyId = companyId
            if (att.bio !== undefined) attUpdate.bio = att.bio
            if (att.linkedin !== undefined) attUpdate.linkedin = att.linkedin
            if (att.imageUrl !== undefined) attUpdate.imageUrl = att.imageUrl
            if (att.isExternal !== undefined) attUpdate.isExternal = att.isExternal
            if (att.type !== undefined) attUpdate.type = att.type
            if (att.seniorityLevel !== undefined) attUpdate.seniorityLevel = att.seniorityLevel

            await prisma.attendee.upsert({
                where: { id: att.id },
                create: {
                    id: att.id,
                    name: att.name,
                    email: att.email,
                    title: att.title,
                    companyId,
                    bio: att.bio,
                    linkedin: att.linkedin,
                    imageUrl: att.imageUrl,
                    isExternal: att.isExternal,
                    type: att.type,
                    seniorityLevel: att.seniorityLevel,
                    events: {
                        connect: { id: eventId }
                    }
                },
                update: {
                    ...attUpdate,
                    events: {
                        connect: { id: eventId }
                    }
                }
            }).catch(e => console.warn('Attendee import skip', e))
        }
    }

    // 5. Import Meetings
    if (data.meetings && Array.isArray(data.meetings)) {
        for (const mtg of data.meetings) {
            let attendeeConnects: any = undefined
            if (mtg.attendees !== undefined) {
                attendeeConnects = mtg.attendees?.map((a: any) => {
                    if (typeof a === 'string') return { id: a }
                    return { id: a.id }
                }) || []
            }

            const mtgUpdate: any = {}
            if (mtg.title !== undefined) mtgUpdate.title = mtg.title
            if (mtg.purpose !== undefined) mtgUpdate.purpose = mtg.purpose
            if (mtg.date !== undefined) mtgUpdate.date = mtg.date
            if (mtg.startTime !== undefined) mtgUpdate.startTime = mtg.startTime
            if (mtg.endTime !== undefined) mtgUpdate.endTime = mtg.endTime
            if (mtg.roomId !== undefined) mtgUpdate.roomId = mtg.roomId
            if (attendeeConnects !== undefined) {
                mtgUpdate.attendees = { set: attendeeConnects }
            }
            if (mtg.sequence !== undefined) mtgUpdate.sequence = mtg.sequence
            if (mtg.status !== undefined) mtgUpdate.status = mtg.status
            if (mtg.tags !== undefined) mtgUpdate.tags = mtg.tags
            if (mtg.calendarInviteSent !== undefined) mtgUpdate.calendarInviteSent = mtg.calendarInviteSent
            if (mtg.createdBy !== undefined) mtgUpdate.createdBy = mtg.createdBy
            if (mtg.isApproved !== undefined) mtgUpdate.isApproved = mtg.isApproved
            if (mtg.meetingType !== undefined) mtgUpdate.meetingType = mtg.meetingType
            if (mtg.otherDetails !== undefined) mtgUpdate.otherDetails = mtg.otherDetails
            if (mtg.requesterEmail !== undefined) mtgUpdate.requesterEmail = mtg.requesterEmail
            if (mtg.location !== undefined) mtgUpdate.location = mtg.location

            const createConnects = mtg.attendees?.map((a: any) => {
                if (typeof a === 'string') return { id: a }
                return { id: a.id }
            }) || []

            await prisma.meeting.upsert({
                where: { id: mtg.id },
                create: {
                    id: mtg.id,
                    title: mtg.title,
                    purpose: mtg.purpose,
                    startTime: mtg.startTime,
                    endTime: mtg.endTime,
                    roomId: mtg.roomId,
                    sequence: mtg.sequence || 0,
                    status: mtg.status || 'PIPELINE',
                    tags: mtg.tags || [],
                    date: mtg.date,
                    calendarInviteSent: mtg.calendarInviteSent || false,
                    createdBy: mtg.createdBy,
                    isApproved: mtg.isApproved || false,
                    meetingType: mtg.meetingType,
                    otherDetails: mtg.otherDetails,
                    requesterEmail: mtg.requesterEmail,
                    location: mtg.location,
                    eventId,
                    attendees: {
                        connect: createConnects
                    }
                },
                update: mtgUpdate
            }).catch(e => console.warn('Meeting import skip', e))
        }
    }

    // 6. Import ROI Targets
    if (data.roiTargets) {
        const roi = data.roiTargets

        // Handle target companies
        let targetCompanyConnect: any = undefined
        if (roi.targetCompanyIds && Array.isArray(roi.targetCompanyIds)) {
            targetCompanyConnect = roi.targetCompanyIds.map((id: string) => ({ id }))
        } else if (roi.targetCompanies && Array.isArray(roi.targetCompanies)) {
            // Legacy: targetCompanies was string[] of company names
            const companyIds: string[] = []
            for (const name of roi.targetCompanies) {
                if (typeof name === 'string') {
                    const companyId = await resolveCompany(name)
                    companyIds.push(companyId)
                }
            }
            targetCompanyConnect = companyIds.map(id => ({ id }))
        }

        await prisma.eventROITargets.upsert({
            where: { eventId },
            create: {
                event: { connect: { id: eventId } },
                expectedPipeline: roi.expectedPipeline,
                winRate: roi.winRate,
                expectedRevenue: roi.expectedRevenue,
                targetCustomerMeetings: roi.targetCustomerMeetings ?? roi.targetBoothMeetings ?? null,
                targetErta: roi.targetErta ?? roi.targetTargetedReach ?? roi.targetSocialReach ?? null,
                targetSpeaking: roi.targetSpeaking ?? roi.targetKeynotes ?? null,
                targetMediaPR: roi.targetMediaPR ?? null,
                targetCompanies: targetCompanyConnect ? { connect: targetCompanyConnect } : undefined,
                actualErta: roi.actualErta ?? roi.actualTargetedReach ?? roi.actualSocialReach ?? null,
                actualSpeaking: roi.actualSpeaking ?? roi.actualKeynotes ?? null,
                actualMediaPR: roi.actualMediaPR ?? null,
                status: roi.status || 'DRAFT',
                approvedBy: roi.approvedBy,
                approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null,
                submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null,
                rejectedBy: roi.rejectedBy ?? null,
                rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null,
            },
            update: {
                expectedPipeline: roi.expectedPipeline,
                winRate: roi.winRate,
                expectedRevenue: roi.expectedRevenue,
                targetCustomerMeetings: roi.targetCustomerMeetings ?? roi.targetBoothMeetings ?? null,
                targetErta: roi.targetErta ?? roi.targetTargetedReach ?? roi.targetSocialReach ?? null,
                targetSpeaking: roi.targetSpeaking ?? roi.targetKeynotes ?? null,
                targetMediaPR: roi.targetMediaPR ?? null,
                targetCompanies: targetCompanyConnect ? { set: targetCompanyConnect } : undefined,
                actualErta: roi.actualErta ?? roi.actualTargetedReach ?? roi.actualSocialReach ?? null,
                actualSpeaking: roi.actualSpeaking ?? roi.actualKeynotes ?? null,
                actualMediaPR: roi.actualMediaPR ?? null,
                status: roi.status || 'DRAFT',
                approvedBy: roi.approvedBy,
                approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null,
                submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null,
                rejectedBy: roi.rejectedBy ?? null,
                rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null,
            },
        }).catch(e => console.warn('ROI targets import skip', e))
    }

    // 7. Restore intelligence subscriptions scoped to this event
    if (data.intelligenceSubscriptions && Array.isArray(data.intelligenceSubscriptions)) {
        const eventAttendeeIds = (data.attendees ?? []).map((a: any) => a.id)

        for (const s of data.intelligenceSubscriptions) {
            let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId: s.userId } })
            if (!sub) {
                sub = await prisma.intelligenceSubscription.create({
                    data: { userId: s.userId, email: s.email, active: s.active ?? true },
                }).catch(() => null)
            }
            if (!sub) continue

            // Restore event selection
            for (const eid of (s.selectedEventIds ?? [])) {
                if (eid !== eventId) continue
                await prisma.intelligenceSubEvent.upsert({
                    where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId: eid } },
                    create: { subscriptionId: sub.id, eventId: eid },
                    update: {},
                }).catch(() => {})
            }

            // Restore attendee selections (only those in this event)
            for (const aid of (s.selectedAttendeeIds ?? [])) {
                if (!eventAttendeeIds.includes(aid)) continue
                const exists = await prisma.attendee.findUnique({ where: { id: aid } })
                if (!exists) continue
                await prisma.intelligenceSubAttendee.upsert({
                    where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId: aid } },
                    create: { subscriptionId: sub.id, attendeeId: aid },
                    update: {},
                }).catch(() => {})
            }

            // Restore company selections
            for (const cid of (s.selectedCompanyIds ?? [])) {
                const exists = await prisma.company.findUnique({ where: { id: cid } })
                if (!exists) continue
                await prisma.intelligenceSubCompany.upsert({
                    where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId: cid } },
                    create: { subscriptionId: sub.id, companyId: cid },
                    update: {},
                }).catch(() => {})
            }
        }

        // Recompute subscriptionCounts for entities in this event
        const attendeeIds = (data.attendees ?? []).map((a: any) => a.id)
        for (const aid of attendeeIds) {
            const count = await prisma.intelligenceSubAttendee.count({ where: { attendeeId: aid } })
            await prisma.attendee.update({ where: { id: aid }, data: { subscriptionCount: count } }).catch(() => {})
        }
        const eventSubCount = await prisma.intelligenceSubEvent.count({ where: { eventId } })
        await prisma.event.update({ where: { id: eventId }, data: { subscriptionCount: eventSubCount } }).catch(() => {})

        // Recompute company subscriptionCounts for restored company selections
        const companyIds = (data.intelligenceSubscriptions as any[]).flatMap((s: any) => s.selectedCompanyIds ?? [])
        const uniqueCompanyIds = [...new Set(companyIds)] as string[]
        for (const cid of uniqueCompanyIds) {
            const count = await prisma.intelligenceSubCompany.count({ where: { companyId: cid } })
            await prisma.company.update({ where: { id: cid }, data: { subscriptionCount: count } }).catch(() => {})
        }
    }

    return { success: true }
}
