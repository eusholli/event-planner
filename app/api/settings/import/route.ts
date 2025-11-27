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

        // 1. Update Event Settings
        if (config.event) {
            const existingSettings = await prisma.eventSettings.findFirst()
            const eventData = parseDates(config.event)

            if (existingSettings) {
                await prisma.eventSettings.update({
                    where: { id: existingSettings.id },
                    data: eventData
                })
            } else {
                await prisma.eventSettings.create({
                    data: eventData
                })
            }
        }

        // 2. Import Rooms
        if (config.rooms && Array.isArray(config.rooms)) {
            for (const room of config.rooms) {
                const existing = await prisma.room.findFirst({ where: { name: room.name } })
                if (!existing) {
                    await prisma.room.create({ data: room })
                }
            }
        }

        // 3. Import Attendees
        if (config.attendees && Array.isArray(config.attendees)) {
            for (const attendee of config.attendees) {
                const existing = await prisma.attendee.findUnique({ where: { email: attendee.email } })
                if (!existing) {
                    await prisma.attendee.create({ data: attendee })
                } else {
                    // Update existing attendee with new fields if present
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
                // We need to be careful with dynamic fields here. 
                // For now, we'll stick to title and startTime/date as unique identifiers if they exist.
                const whereClause: any = { title: meeting.title }
                if (meeting.startTime) whereClause.startTime = meeting.startTime
                if (meeting.date) whereClause.date = meeting.date

                const existing = await prisma.meeting.findFirst({
                    where: whereClause
                })

                if (!existing) {
                    const meetingData = parseDates(meetingFields)

                    await prisma.meeting.create({
                        data: {
                            ...meetingData,
                            roomId: roomId,
                            attendees: {
                                connect: attendees
                            }
                        }
                    })
                }
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Import error:', error)
        return NextResponse.json({ error: 'Failed to import data' }, { status: 500 })
    }
}
