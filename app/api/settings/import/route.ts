import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        const text = await file.text()
        const config = JSON.parse(text)

        // Helper to parse dates in an object
        const parseDates = (obj: any) => {
            const newObj: any = { ...obj }
            for (const key in newObj) {
                if (typeof newObj[key] === 'string') {
                    // Check if it looks like a date (ISO format or YYYY-MM-DD)
                    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}.*)?Z?$/.test(newObj[key])) {
                        const d = new Date(newObj[key])
                        if (!isNaN(d.getTime())) {
                            newObj[key] = d
                        }
                    }
                }
            }
            return newObj
        }

        // 1. Update System Settings
        if (config.system) {
            const existingSettings = await prisma.systemSettings.findFirst()
            // Only update fields that exist in SystemSettings (geminiApiKey)
            const { geminiApiKey } = config.system

            if (existingSettings) {
                await prisma.systemSettings.update({
                    where: { id: existingSettings.id },
                    data: { geminiApiKey }
                })
            } else {
                await prisma.systemSettings.create({
                    data: { geminiApiKey }
                })
            }
        }

        // 1b. Import Events
        if (config.events && Array.isArray(config.events)) {
            for (const evt of config.events) {
                const parsedEvt = parseDates(evt)
                // Use name as unique key? Or just create always?
                const existing = await prisma.event.findFirst({ where: { name: parsedEvt.name } })
                if (existing) {
                    await prisma.event.update({
                        where: { id: existing.id },
                        data: parsedEvt
                    })
                } else {
                    await prisma.event.create({ data: parsedEvt })
                }
            }
        }

        // 2. Import Rooms
        if (config.rooms && Array.isArray(config.rooms)) {
            for (const room of config.rooms) {
                const existing = await prisma.room.findFirst({ where: { name: room.name } })

                // Fix strategy: Look for event.
                const evt = await prisma.event.findFirst()
                const eventId = evt?.id

                if (!existing) {
                    await prisma.room.create({ data: { ...room, eventId } })
                } else {
                    // Update link if missing?
                    if (!existing.eventId && eventId) {
                        await prisma.room.update({ where: { id: existing.id }, data: { eventId } })
                    }
                }
            }
        }

        // 3. Import Attendees
        if (config.attendees && Array.isArray(config.attendees)) {
            for (const attendee of config.attendees) {
                const existing = await prisma.attendee.findUnique({ where: { email: attendee.email } })

                // Link to event?
                const evt = await prisma.event.findFirst()
                const eventId = evt?.id

                if (!existing) {
                    await prisma.attendee.create({ data: { ...attendee, eventId } })
                } else {
                    await prisma.attendee.update({
                        where: { email: attendee.email },
                        data: attendee
                    })
                }
            }
        }

        // 4. Import Meetings
        if (config.meetings && Array.isArray(config.meetings)) {
            for (const meeting of config.meetings) {
                // Extract relations and special fields
                const { room: roomName, attendees: attendeeEmails, ...meetingFields } = meeting

                // Find Room ID
                let roomId = null
                if (roomName) {
                    const room = await prisma.room.findFirst({ where: { name: roomName } })
                    if (room) roomId = room.id
                }

                // Find Attendee IDs
                const attendees = []
                if (attendeeEmails && Array.isArray(attendeeEmails)) {
                    for (const email of attendeeEmails) {
                        const attendee = await prisma.attendee.findUnique({ where: { email } })
                        if (attendee) attendees.push({ id: attendee.id })
                    }
                }

                // Check if meeting exists (by title and date/startTime)
                const whereClause: any = { title: meeting.title }
                if (meeting.startTime) whereClause.startTime = meeting.startTime
                if (meeting.date) whereClause.date = meeting.date

                const existing = await prisma.meeting.findFirst({
                    where: whereClause
                })

                // Link to event?
                const evt = await prisma.event.findFirst()
                const eventId = evt?.id

                if (!existing) {
                    // Explicitly exclude roomId from meetingFields to prevent bad data injection
                    const { roomId: _rawId, ...cleanMeetingFields } = meetingFields as any

                    if (roomId) {
                        // Double check if room exists
                        const roomCheck = await prisma.room.findUnique({ where: { id: roomId } })
                        if (!roomCheck) {
                            roomId = null
                        }
                    }

                    try {
                        await prisma.meeting.create({
                            data: {
                                ...cleanMeetingFields,
                                roomId: roomId,
                                eventId: eventId,
                                attendees: {
                                    connect: attendees
                                }
                            }
                        })
                    } catch (e) {
                        console.error('Import meeting error', e)
                    }
                }
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Import error:', error)
        return NextResponse.json({ error: 'Failed to import data' }, { status: 500 })
    }
}
