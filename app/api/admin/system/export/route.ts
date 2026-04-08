import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        // Fetch all companies
        const companies = await prisma.company.findMany({
            orderBy: { name: 'asc' }
        })

        const events = await prisma.event.findMany({
            include: {
                attendees: { include: { meetings: true } },
                rooms: true,
                meetings: { include: { attendees: true, room: true } },
                roiTargets: { include: { targetCompanies: true } },
                linkedInDrafts: true,
                marketingChecklist: true
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

            // Normalize ROI targets
            const roiTargets = event.roiTargets ? (() => {
                const { targetCompanies, ...rest } = event.roiTargets
                return {
                    ...rest,
                    targetCompanyIds: targetCompanies.map(c => c.id)
                }
            })() : null

            return {
                ...event,
                attendees: undefined, // Remove full object array
                attendeeIds,          // Add ID reference array
                meetings: normalizedMeetings,
                roiTargets,
                linkedInDrafts: (event.linkedInDrafts ?? []).map(({ eventId: _eid, ...rest }) => rest)
            }
        })

        const settings = await prisma.systemSettings.findFirst()

        const intelligenceSubscriptions = await prisma.intelligenceSubscription.findMany({
          include: {
            selectedAttendees: { select: { attendeeId: true } },
            selectedCompanies: { select: { companyId: true } },
            selectedEvents:    { select: { eventId: true } },
          },
        })

        const exportData = {
            systemSettings: settings,
            companies: companies,  // Global Company List
            attendees: Array.from(attendeeMap.values()), // Global Unique List
            events: normalizedEvents,
            intelligenceSubscriptions: intelligenceSubscriptions.map(s => ({
              id: s.id,
              userId: s.userId,
              email: s.email,
              active: s.active,
              unsubscribeToken: s.unsubscribeToken,
              selectedAttendeeIds: s.selectedAttendees.map(r => r.attendeeId),
              selectedCompanyIds:  s.selectedCompanies.map(r => r.companyId),
              selectedEventIds:    s.selectedEvents.map(r => r.eventId),
            })),
            exportedAt: new Date().toISOString(),
            version: '5.0-simplified-roi'
        }

        return NextResponse.json(exportData)
    } catch (error) {
        console.error('System export error:', error)
        return NextResponse.json({ error: 'Failed to export system' }, { status: 500 })
    }
}

export const GET = withAuth(handleGET, { requireRole: 'root' }) as any
