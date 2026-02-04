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

        // Normalize data: Extract unique attendees to top-level
        const attendeeMap = new Map<string, any>()

        const normalizedEvents = events.map(event => {
            // Processing Event Attendees
            const attendeeIds = event.attendees.map(attendee => {
                // Add to global map if not present
                if (!attendeeMap.has(attendee.id)) {
                    // Remove nested meetings from attendee object for the global list
                    const { meetings, ...rest } = attendee
                    attendeeMap.set(attendee.id, rest)
                }
                return attendee.id
            })

            // Processing Event Meetings
            const normalizedMeetings = event.meetings.map(meeting => {
                const { attendees, room, ...rest } = meeting
                return {
                    ...rest,
                    attendees: attendees.map(a => a.id) // Reference by ID
                }
            })

            return {
                ...event,
                attendees: undefined, // Remove full object array
                attendeeIds,          // Add ID reference array
                meetings: normalizedMeetings
            }
        })

        const settings = await prisma.systemSettings.findFirst()

        const exportData = {
            systemSettings: settings,
            attendees: Array.from(attendeeMap.values()), // Global Unique List
            events: normalizedEvents,
            exportedAt: new Date().toISOString(),
            version: '3.0-normalized-system'
        }

        return NextResponse.json(exportData)
    } catch (error) {
        console.error('System export error:', error)
        return NextResponse.json({ error: 'Failed to export system' }, { status: 500 })
    }
}
