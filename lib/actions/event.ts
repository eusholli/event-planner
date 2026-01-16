'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { JSDOM } from 'jsdom'
import prisma from '@/lib/prisma'

export async function generateEventDetails(url: string, currentData?: any) {
    try {
        console.log('Generating details for URL:', url)

        // 3. Call Gemini
        const settings = await prisma.systemSettings.findFirst()
        const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY

        if (!apiKey) {
            return { debug: 'Gemini API Key not configured in System Settings.' }
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

        const prompt = `
        You are an event data expert. Validated details are needed for an event.
        
        Target Event URL: ${url}
        ${currentData?.name ? `Event Name Hint: ${currentData.name}` : ''}
        
        Existing Known Data:
        ${currentData ? JSON.stringify(currentData, null, 2) : 'None'}

        Task:
        1. Analyze the URL structure and the Event Name (if provided) to infer details.
        2. Use your internal knowledge base to find information about this event (e.g. if it is a famous conference like "CES 2025" or "FutureNet World").
        3. Do NOT try to browse the live internet if you cannot access it. Rely on your training data and inference.
        
        Return a JSON object ONLY with the following fields (if found/inferred, else null):
        - name (string) - The official event name.
        - startDate (YYYY-MM-DD)
        - endDate (YYYY-MM-DD)
        - location (string: City, Country)
        - address (string: Full venue address if known)
        - region (string: One of NA, SA, EU/UK, MEA, APAC, Japan. Infer from location.)
        - description (string: Brief summary of the event)
        - debug (string: A short sentence explaining how you found this info, e.g. "Known event in training data" or "Inferred from URL")
        
        JSON Format:
        `

        const result = await model.generateContent(prompt)
        const text = result.response.text()

        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim()

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

    // Clean up circular refs if necessary or just return raw JSON structure
    // Prisma returns POJOs, so JSON.stringify should handle it unless there are deeply nested circular connects not handled by Next.js serialization
    // Actually, we want a clean export format.

    return {
        event: {
            ...event,
            meetings: undefined,
            attendees: undefined,
            rooms: undefined
        },
        attendees: event.attendees,
        rooms: event.rooms,
        meetings: event.meetings,
        exportedAt: new Date().toISOString(),
        version: '2.0'
    }
}

export async function deleteEventData(eventId: string) {
    // Dangerous action. Only Root/Admin.
    // Constraints are CASCADE, so deleting Event deletes all children.

    // Check permissions (should be done by caller or middleware, but safer here)
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    await prisma.event.delete({
        where: { id: eventId }
    })
    return { success: true }
}

export async function importEventData(eventId: string, data: any) {
    // Merge strategy? Or overwite?
    // Plan said "add new data or update existing". 
    // If ID matches, update? If ID new, create?
    // Usually Config JSONs have specific IDs or we ignore IDs and create new.
    // For "Restore", we might want to keep IDs.

    // For simplicity and safety:
    // This function imports components INTO an existing event container.
    // It assumes `data` contains lists of attendees, rooms, etc.

    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    // 1. Settings Update (if present)
    if (data.event) {
        await prisma.event.update({
            where: { id: eventId },
            data: {
                // Update editable fields
                name: data.event.name,
                startDate: data.event.startDate,
                endDate: data.event.endDate,
                tags: data.event.tags,
                meetingTypes: data.event.meetingTypes,
                attendeeTypes: data.event.attendeeTypes,
                // ... others
            }
        })
    }

    // 2. Import Rooms
    if (data.rooms && Array.isArray(data.rooms)) {
        for (const room of data.rooms) {
            await prisma.room.upsert({
                where: { id: room.id || 'new' }, // 'new' will fail find, so create. unique ID needed.
                create: {
                    name: room.name,
                    capacity: room.capacity,
                    eventId
                },
                update: {
                    name: room.name,
                    capacity: room.capacity
                    // Don't update eventId
                }
            }).catch(e => console.warn('Room import skip', e))
        }
    }

    // 3. Import Attendees
    if (data.attendees && Array.isArray(data.attendees)) {
        for (const att of data.attendees) {
            // Check unique constraint [email, eventId]
            await prisma.attendee.upsert({
                where: {
                    email_eventId: {
                        email: att.email,
                        eventId
                    }
                },
                create: {
                    ...att,
                    id: undefined, // Let DB gen ID or use existing? 
                    // If we use existing ID, we might conflict with other events if IDs were global (CUIDs are unique though).
                    // Safer to let DB gen ID for imported entities to avoid collisions?
                    // But if we want to LINK meetings, we need stable IDs.
                    // Let's try to use provied ID if valid CUID.
                    // Actually, safest for "Import" into EXISTING event is to match by Email.
                    eventId
                },
                update: {
                    ...att,
                    id: undefined,
                    eventId: undefined
                }
            }).catch(e => console.warn('Attendee import skip', e))
        }
    }

    // 4. Import Meetings
    if (data.meetings && Array.isArray(data.meetings)) {
        for (const meeting of data.meetings) {
            // Extract relations
            // meeting.room is an object, meeting.attendees is array of objects
            const { room, attendees, ...meetingFields } = meeting as any
            const roomName = room?.name
            const attendeeEmails = attendees?.map((a: any) => a.email)

            // 4a. Find Room ID (scoped to this event)
            let roomId = null
            if (roomName) {
                const room = await prisma.room.findFirst({
                    where: {
                        name: roomName,
                        eventId
                    }
                })
                if (room) roomId = room.id
            }

            // 4b. Find Attendee IDs (scoped to this event)
            const attendeeIds = []
            if (attendeeEmails && Array.isArray(attendeeEmails)) {
                for (const email of attendeeEmails) {
                    const att = await prisma.attendee.findUnique({
                        where: {
                            email_eventId: {
                                email,
                                eventId
                            }
                        }
                    })
                    if (att) attendeeIds.push({ id: att.id })
                }
            }

            // 4c. Create/Upsert Meeting
            // We use Title + StartTime as unique key for "logic" since Meeting has no unique constraints other than ID
            const whereClause: any = {
                title: meeting.title,
                roomId: roomId // optional check? collisions?
            }
            if (meeting.startTime) whereClause.startTime = meeting.startTime

            // But wait, if we deleted the event, the IDs are gone. New IDs are generated. 
            // So we can't use ID. We must use "Title + StartTime" + "Room" to check existence?
            // Actually, if we just deleted the event, all meetings are gone. 
            // So we can just create them. 
            // BUT, if we are "updating" an existing event, we strictly want to avoid duplicates.
            // Let's try to match by Title + StartTime + RoomId (if present).

            // Simple duplicates check:
            const existing = await prisma.meeting.findFirst({
                where: {
                    title: meeting.title,
                    startTime: meeting.startTime,
                    eventId
                }
            })

            if (!existing) {
                // exclude id, eventId from fields just in case
                const { id: _id, eventId: _eid, ...cleanFields } = meetingFields

                await prisma.meeting.create({
                    data: {
                        ...cleanFields,
                        eventId,
                        roomId,
                        attendees: {
                            connect: attendeeIds
                        }
                    }
                }).catch(e => console.warn('Meeting import failed', e))
            }
        }
    }

    return { success: true }
}
