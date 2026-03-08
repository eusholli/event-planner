import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

async function exportData(): Promise<Response> {
    try {
        const settings = await prisma.systemSettings.findFirst()
        const events = await prisma.event.findMany()
        const attendees = await prisma.attendee.findMany()
        const rooms = await prisma.room.findMany()
        const meetings = await prisma.meeting.findMany({
            include: {
                room: true,
                attendees: true
            }
        })
        const roiTargets = await prisma.eventROITargets.findMany()

        // Helper to remove ID and other internal fields
        const cleanData = (data: any) => {
            if (!data) return null
            const { id, ...rest } = data
            return rest
        }

        // Group ROI targets by eventId
        const roiByEvent = new Map(roiTargets.map(r => [r.eventId, r]))

        const exportDataObj = {
            system: settings ? cleanData(settings) : null,
            events: events.map(e => {
                const roi = roiByEvent.get(e.id)
                return {
                    ...cleanData(e),
                    roiTargets: roi ? (() => {
                        const { id: _id, eventId: _eid, event: _ev, ...rest } = roi as any
                        return rest
                    })() : null
                }
            }),
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
        const filename = `system-backup-${date}.json`

        return new NextResponse(JSON.stringify(exportDataObj, null, 2), {
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

const getHandler = withAuth(async () => {
    return exportData()
}, { requireRole: 'root' })

export async function GET(request: Request, ctx: { params: Promise<Record<string, string>> }) {
    // Check backup key header first (automation bypass)
    const backupKey = request.headers.get('x-backup-key') ?? request.headers.get('authorization')?.replace('Bearer ', '')
    if (backupKey && process.env.BACKUP_SECRET_KEY && backupKey === process.env.BACKUP_SECRET_KEY) {
        return exportData()
    }
    // Otherwise enforce root role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getHandler(request, ctx as any)
}
