import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
    try {
        const settings = await prisma.eventSettings.findFirst()
        const attendees = await prisma.attendee.findMany()
        const rooms = await prisma.room.findMany()
        const meetings = await prisma.meeting.findMany({
            include: {
                room: true,
                attendees: true
            }
        })

        // Helper to remove ID and other internal fields
        const cleanData = (data: any) => {
            if (!data) return null
            const { id, ...rest } = data
            return rest
        }

        const exportData = {
            event: settings ? cleanData(settings) : null,
            attendees: attendees.map(a => cleanData(a)),
            rooms: rooms.map(r => cleanData(r)),
            meetings: meetings.map(m => {
                const { id, roomId, room, attendees, ...rest } = m
                return {
                    ...rest,
                    room: room?.name,
                    attendees: attendees.map(a => a.email)
                }
            })
        }

        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `event-config-${date}.json`

        return new NextResponse(JSON.stringify(exportData, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })
    } catch (error) {
        console.error('Export error:', error)
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
    }
}
