'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { JSDOM } from 'jsdom'
import prisma from '@/lib/prisma'

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
        - expectedRoi (string: Summary of potential ROI value)
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

// Data Management Actions
export async function exportEventData(eventId: string) {
    // Only Root or Admin (with event access)
    // We fetch EVERYTHING scoped to this event
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            attendees: { include: { meetings: true } },
            rooms: true,
            meetings: { include: { attendees: true, room: true } }
        }
    })

    if (!event) throw new Error('Event not found')

    // Normalize data to reduce size and duplication (Version 2.1)
    const normalizedAttendees = event.attendees.map(attendee => {
        const { meetings, ...rest } = attendee
        return rest
    })

    const normalizedMeetings = event.meetings.map(meeting => {
        const { attendees, room, ...rest } = meeting
        return {
            ...rest,
            attendees: attendees.map(a => a.id)
        }
    })

    // Return normalized structure
    return {
        event: {
            ...event,
            meetings: undefined,
            attendees: undefined,
            rooms: undefined
        },
        attendees: normalizedAttendees,
        rooms: event.rooms,
        meetings: normalizedMeetings,
        exportedAt: new Date().toISOString(),
        version: '2.1'
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
        prisma.attendee.deleteMany({ where: { eventId } }),
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

    // 2. Event Update (Merge)
    if (data.event) {
        const eventUpdate: any = {}
        // Only update fields present in JSON
        if (data.event.name !== undefined) eventUpdate.name = data.event.name
        if (data.event.startDate !== undefined) eventUpdate.startDate = data.event.startDate
        if (data.event.endDate !== undefined) eventUpdate.endDate = data.event.endDate
        if (data.event.status !== undefined) eventUpdate.status = data.event.status
        if (data.event.region !== undefined) eventUpdate.region = data.event.region
        if (data.event.url !== undefined) eventUpdate.url = data.event.url
        if (data.event.budget !== undefined) eventUpdate.budget = data.event.budget
        if (data.event.targetCustomers !== undefined) eventUpdate.targetCustomers = data.event.targetCustomers
        if (data.event.expectedRoi !== undefined) eventUpdate.expectedRoi = data.event.expectedRoi
        if (data.event.requesterEmail !== undefined) eventUpdate.requesterEmail = data.event.requesterEmail
        if (data.event.tags !== undefined) eventUpdate.tags = data.event.tags
        if (data.event.meetingTypes !== undefined) eventUpdate.meetingTypes = data.event.meetingTypes
        if (data.event.attendeeTypes !== undefined) eventUpdate.attendeeTypes = data.event.attendeeTypes
        if (data.event.address !== undefined) eventUpdate.address = data.event.address
        if (data.event.timezone !== undefined) eventUpdate.timezone = data.event.timezone

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
            const attUpdate: any = {}
            if (att.name !== undefined) attUpdate.name = att.name
            if (att.email !== undefined) attUpdate.email = att.email
            if (att.title !== undefined) attUpdate.title = att.title
            if (att.company !== undefined) attUpdate.company = att.company
            if (att.bio !== undefined) attUpdate.bio = att.bio
            if (att.linkedin !== undefined) attUpdate.linkedin = att.linkedin
            if (att.imageUrl !== undefined) attUpdate.imageUrl = att.imageUrl
            if (att.isExternal !== undefined) attUpdate.isExternal = att.isExternal
            if (att.type !== undefined) attUpdate.type = att.type

            await prisma.attendee.upsert({
                where: { id: att.id },
                create: {
                    id: att.id,
                    name: att.name,
                    email: att.email,
                    title: att.title,
                    company: att.company,
                    bio: att.bio,
                    linkedin: att.linkedin,
                    imageUrl: att.imageUrl,
                    isExternal: att.isExternal,
                    type: att.type,
                    eventId
                },
                update: attUpdate
            }).catch(e => console.warn('Attendee import skip', e))
        }
    }

    // 5. Import Meetings
    if (data.meetings && Array.isArray(data.meetings)) {
        for (const mtg of data.meetings) {
            // Prepare attendee connections
            let attendeeConnects: any = undefined
            if (mtg.attendees !== undefined) {
                attendeeConnects = mtg.attendees?.map((a: any) => {
                    if (typeof a === 'string') return { id: a }
                    return { id: a.id }
                }) || []
            }

            const mtgUpdate: any = {}
            if (mtg.title !== undefined) mtgUpdate.title = mtg.title
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

    return { success: true }
}
