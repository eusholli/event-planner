import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isRootUser } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        if (!await isRootUser()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const events = await prisma.event.findMany({
            include: {
                attendees: { include: { meetings: true } },
                rooms: true,
                meetings: { include: { attendees: true, room: true } }
            }
        })

        // Normalize data to reduce size and duplication
        const normalizedEvents = events.map(event => ({
            ...event,
            attendees: event.attendees.map(attendee => {
                // Remove nested meetings from attendees
                const { meetings, ...rest } = attendee
                return rest
            }),
            meetings: event.meetings.map(meeting => {
                // Convert full attendee objects to just IDs
                // Remove room object (roomId is already there)
                const { attendees, room, ...rest } = meeting
                return {
                    ...rest,
                    attendees: attendees.map(a => a.id)
                }
            })
        }))

        const settings = await prisma.systemSettings.findFirst()

        const exportData = {
            systemSettings: settings,
            events: normalizedEvents,
            exportedAt: new Date().toISOString(),
            version: '2.1-normalized-system'
        }

        return NextResponse.json(exportData)
    } catch (error) {
        console.error('System export error:', error)
        return NextResponse.json({ error: 'Failed to export system' }, { status: 500 })
    }
}
