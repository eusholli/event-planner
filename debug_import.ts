
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const config = {
    "event": {
        "name": "MWC BCN 2026",
        "startDate": "2025-03-02T09:00:00.000Z",
        "endDate": "2025-03-05T17:00:00.000Z",
        "geminiApiKey": ""
    },
    "attendees": [
        {
            "name": "Alice Executive",
            "title": "CEO",
            "email": "alice@example.com",
            "bio": "CEO with 20 years of experience in tech.",
            "company": "TechCorp",
            "companyDescription": "Leading provider of enterprise software.",
            "imageUrl": ""
        },
        {
            "name": "Bob Partner",
            "title": "Managing Partner",
            "email": "bob@example.com",
            "bio": "Managing Partner at VentureFirm.",
            "company": "VentureFirm",
            "companyDescription": "Global venture capital firm.",
            "imageUrl": ""
        }
    ],
    "rooms": [
        {
            "name": "Boardroom A",
            "capacity": 20
        },
        {
            "name": "Auditorium",
            "capacity": 100
        }
    ],
    "meetings": [
        {
            "title": "Opening Keynote",
            "startTime": "2025-03-02T09:00:00.000Z",
            "endTime": "2025-03-02T10:00:00.000Z",
            "room": "Auditorium",
            "attendees": [
                "alice@example.com"
            ]
        }
    ]
}

async function debugImport() {
    console.log('Starting debug import...')

    try {
        // 1. Update Event Settings
        console.log('Importing settings...')
        if (config.event) {
            const existingSettings = await prisma.eventSettings.findFirst()
            const data = {
                name: config.event.name,
                startDate: new Date(config.event.startDate),
                endDate: new Date(config.event.endDate),
                geminiApiKey: config.event.geminiApiKey,
                tags: (config.event as any).tags || []
            }

            if (existingSettings) {
                await prisma.eventSettings.update({
                    where: { id: existingSettings.id },
                    data
                })
            } else {
                await prisma.eventSettings.create({
                    data
                })
            }
        }

        // 2. Import Rooms
        console.log('Importing rooms...')
        if (config.rooms && Array.isArray(config.rooms)) {
            for (const room of config.rooms) {
                const existing = await prisma.room.findFirst({ where: { name: room.name } })
                if (!existing) {
                    await prisma.room.create({ data: room })
                }
            }
        }

        // 3. Import Attendees
        console.log('Importing attendees...')
        if (config.attendees && Array.isArray(config.attendees)) {
            for (const attendee of config.attendees) {
                const existing = await prisma.attendee.findUnique({ where: { email: attendee.email } })
                if (!existing) {
                    await prisma.attendee.create({ data: attendee })
                } else {
                    await prisma.attendee.update({
                        where: { email: attendee.email },
                        data: attendee
                    })
                }
            }
        }

        // 4. Import Meetings
        console.log('Importing meetings...')
        if (config.meetings && Array.isArray(config.meetings)) {
            for (const meeting of config.meetings) {
                console.log('Processing meeting:', meeting.title)

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

                // Parse date and time
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

                console.log('Parsed values:', { date, startTime, endTime })

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
                        status: (meeting as any).status || 'STARTED',
                        tags: (meeting as any).tags || []
                    }
                })
                console.log('Meeting created successfully')
            }
        }

        console.log('Import successful!')
    } catch (error) {
        console.error('Import failed:', error)
    } finally {
        await prisma.$disconnect()
    }
}

debugImport()
