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

        // 1. Update Event Settings
        if (config.event) {
            const existingSettings = await prisma.eventSettings.findFirst()
            if (existingSettings) {
                await prisma.eventSettings.update({
                    where: { id: existingSettings.id },
                    data: {
                        name: config.event.name,
                        startDate: new Date(config.event.startDate),
                        endDate: new Date(config.event.endDate),
                        geminiApiKey: config.event.geminiApiKey,
                        tags: config.event.tags || []
                    }
                })
            } else {
                await prisma.eventSettings.create({
                    data: {
                        name: config.event.name,
                        startDate: new Date(config.event.startDate),
                        endDate: new Date(config.event.endDate),
                        geminiApiKey: config.event.geminiApiKey,
                        tags: config.event.tags || []
                    }
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
                // Find Room ID
                let roomId = null
                if (meeting.room) {
                    const room = await prisma.room.findFirst({ where: { name: meeting.room } })
                    if (room) roomId = room.id
                }

                // Find Attendee IDs
                const attendees = []
                if (meeting.attendees && Array.isArray(meeting.attendees)) {
                    for (const email of meeting.attendees) {
                        const attendee = await prisma.attendee.findUnique({ where: { email } })
                        if (attendee) attendees.push({ id: attendee.id })
                    }
                }

                // Check if meeting exists (by title and date)
                const existing = await prisma.meeting.findFirst({
                    where: {
                        title: meeting.title,
                        // This is a loose check, but sufficient for import
                        date: meeting.startTime ? new Date(meeting.startTime).toISOString().split('T')[0] : undefined
                    }
                })

                if (!existing) {
                    // Parse date and time from ISO strings if present
                    let date = null
                    let startTime = null
                    let endTime = null

                    if (meeting.startTime) {
                        const start = new Date(meeting.startTime)
                        date = start.toISOString().split('T')[0]
                        startTime = start.toTimeString().slice(0, 5)
                    }
                    if (meeting.endTime) {
                        const end = new Date(meeting.endTime)
                        endTime = end.toTimeString().slice(0, 5)
                    }

                    await prisma.meeting.create({
                        data: {
                            title: meeting.title,
                            date,
                            startTime,
                            endTime,
                            roomId: roomId,
                            attendees: {
                                connect: attendees
                            },
                            status: meeting.status || 'STARTED',
                            tags: meeting.tags || []
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
