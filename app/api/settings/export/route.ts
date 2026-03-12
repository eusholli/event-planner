import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { userIdsToEmails } from '@/lib/clerk-export'

export const dynamic = 'force-dynamic'

async function exportData(): Promise<Response> {
    try {
        const settings = await prisma.systemSettings.findFirst()
        const companies = await prisma.company.findMany()
        const events = await prisma.event.findMany({
            include: { roiTargets: { include: { targetCompanies: true } } }
        })
        const attendees = await prisma.attendee.findMany()
        const rooms = await prisma.room.findMany()
        const meetings = await prisma.meeting.findMany({
            include: { room: true, attendees: true }
        })

        // Build lookup maps
        const companyIdToName = new Map(companies.map(c => [c.id, c.name]))
        const eventIdToName = new Map(events.map(e => [e.id, e.name]))

        // System settings
        const systemOut = settings ? {
            geminiApiKey: settings.geminiApiKey,
            defaultTags: settings.defaultTags,
            defaultMeetingTypes: settings.defaultMeetingTypes,
            defaultAttendeeTypes: settings.defaultAttendeeTypes,
        } : null

        // Companies: strip id
        const companiesOut = companies.map(c => ({
            name: c.name,
            description: c.description,
            pipelineValue: c.pipelineValue,
        }))

        // Events: strip id, translate authorizedUserIds → authorizedEmails, targetCompanyIds → targetCompanyNames
        const eventsOut: any[] = []
        for (const event of events) {
            const { id, roiTargets, authorizedUserIds, password: _pw, subscriptionCount: _sc, ...eventRest } = event as any

            // Translate authorizedUserIds → authorizedEmails (throws on Clerk failure)
            const authorizedEmails = await userIdsToEmails(authorizedUserIds ?? [])

            const roiOut = roiTargets ? (() => {
                const { id: _id, eventId: _eid, event: _ev, targetCompanies, ...roiRest } = roiTargets as any
                return {
                    ...roiRest,
                    targetCompanyNames: (targetCompanies ?? []).map((c: any) => c.name),
                }
            })() : null

            eventsOut.push({
                ...eventRest,
                authorizedEmails,
                roiTargets: roiOut,
            })
        }

        // Attendees: strip id, companyId → companyName
        const attendeesOut = attendees.map(a => {
            const { id, companyId, ...rest } = a as any
            return { ...rest, companyName: companyIdToName.get(companyId) ?? '' }
        })

        // Rooms: strip id, eventId → eventName
        const roomsOut = rooms.map(r => {
            const { id, eventId, ...rest } = r as any
            return { ...rest, eventName: eventIdToName.get(eventId ?? '') ?? '' }
        })

        // Meetings: strip id/roomId/eventId, eventId → eventName, attendees → emails
        const meetingsOut = meetings.map(m => {
            const { id, roomId, eventId, room, attendees, ...rest } = m as any
            return {
                ...rest,
                eventName: eventIdToName.get(eventId) ?? '',
                room: room?.name ?? null,
                attendees: attendees.map((a: any) => a.email),
            }
        })

        const exportDataObj = {
            version: '5.0',
            exportedAt: new Date().toISOString(),
            system: systemOut,
            companies: companiesOut,
            events: eventsOut,
            attendees: attendeesOut,
            rooms: roomsOut,
            meetings: meetingsOut,
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
    const backupKey = request.headers.get('x-backup-key') ?? request.headers.get('authorization')?.replace('Bearer ', '')
    if (backupKey && process.env.BACKUP_SECRET_KEY && backupKey === process.env.BACKUP_SECRET_KEY) {
        return exportData()
    }
    return getHandler(request, ctx as any)
}
