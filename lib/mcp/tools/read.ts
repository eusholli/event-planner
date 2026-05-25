import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { resolveEventId } from '@/lib/events'
import { canRead } from '@/lib/mcp/auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRole(extra: unknown): string {
    return (extra as Record<string, unknown>)?.role as string ?? ''
}

function forbidden() {
    return {
        content: [{ type: 'text' as const, text: 'Forbidden: requires root or marketing role' }],
        isError: true,
    }
}

function err(msg: string) {
    return {
        content: [{ type: 'text' as const, text: `Error: ${msg}` }],
        isError: true,
    }
}

function ok(data: unknown) {
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
}

// ── Read Tools ────────────────────────────────────────────────────────────────

export function registerReadTools(server: McpServer) {

    server.registerTool(
        'list_events',
        {
            title: 'List Events',
            description: 'List all events. Optionally filter by status, region, or search term.',
            inputSchema: {
                status: z.enum(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']).optional().describe('Filter by event status'),
                region: z.string().optional().describe('Filter by region (partial match)'),
                search: z.string().optional().describe('Search in event name and description'),
                limit: z.number().int().min(1).max(500).default(50).describe('Max results to return'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const where: any = {}
                if (args.status) where.status = args.status
                if (args.region) where.region = { contains: args.region, mode: 'insensitive' }
                if (args.search) {
                    where.OR = [
                        { name: { contains: args.search, mode: 'insensitive' } },
                        { description: { contains: args.search, mode: 'insensitive' } },
                    ]
                }
                const events = await prisma.event.findMany({
                    where,
                    orderBy: { startDate: 'asc' },
                    take: args.limit,
                    include: { roiTargets: { select: { actualCost: true } } },
                })
                return ok(events.map(({ roiTargets, ...e }) => ({
                    ...e,
                    actualCost: roiTargets?.actualCost ?? null,
                })))
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'get_event',
        {
            title: 'Get Event',
            description: 'Get full details for a single event by id or slug.',
            inputSchema: {
                id: z.string().describe('Event id or slug'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const event = await prisma.event.findFirst({
                    where: { OR: [{ id: args.id }, { slug: args.id }] },
                    include: {
                        roiTargets: true,
                        rooms: true,
                        _count: { select: { meetings: true, attendees: true } },
                    },
                })
                if (!event) return err('Event not found')
                return ok(event)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'list_attendees',
        {
            title: 'List Attendees',
            description: 'List attendees, optionally scoped to an event.',
            inputSchema: {
                eventId: z.string().optional().describe('Filter by event id or slug'),
                search: z.string().optional().describe('Search by name, email, or company name'),
                type: z.string().optional().describe('Filter by attendee type'),
                seniorityLevel: z.string().optional().describe('Filter by seniority level (e.g. C-Suite, VP, Director)'),
                companyName: z.string().optional().describe('Filter by company name (partial match)'),
                limit: z.number().int().min(1).max(500).default(100).describe('Max results'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const where: any = {}
                if (args.eventId) {
                    const eid = await resolveEventId(args.eventId)
                    if (!eid) return err('Event not found')
                    where.events = { some: { id: eid } }
                }
                if (args.type) where.type = args.type
                if (args.seniorityLevel) where.seniorityLevel = { contains: args.seniorityLevel, mode: 'insensitive' }
                if (args.companyName) {
                    where.company = { name: { contains: args.companyName, mode: 'insensitive' } }
                }
                if (args.search) {
                    where.OR = [
                        { name: { contains: args.search, mode: 'insensitive' } },
                        { email: { contains: args.search, mode: 'insensitive' } },
                        { company: { name: { contains: args.search, mode: 'insensitive' } } },
                    ]
                }
                const attendees = await prisma.attendee.findMany({
                    where,
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        title: true,
                        type: true,
                        seniorityLevel: true,
                        isExternal: true,
                        company: { select: { id: true, name: true } },
                    },
                    orderBy: { name: 'asc' },
                    take: args.limit,
                })
                return ok(attendees)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'get_attendee',
        {
            title: 'Get Attendee',
            description: 'Get a single attendee by id or email.',
            inputSchema: {
                id: z.string().optional().describe('Attendee id'),
                email: z.string().optional().describe('Attendee email address'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            if (!args.id && !args.email) return err('Either id or email is required')
            try {
                const attendee = await prisma.attendee.findFirst({
                    where: args.id ? { id: args.id } : { email: args.email },
                    include: {
                        company: true,
                        events: { select: { id: true, name: true, slug: true } },
                    },
                })
                if (!attendee) return err('Attendee not found')
                return ok(attendee)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'list_companies',
        {
            title: 'List Companies',
            description: 'List companies with optional filters.',
            inputSchema: {
                search: z.string().optional().describe('Search by company name (partial match)'),
                region: z.string().optional().describe('Filter by region (partial match)'),
                eventId: z.string().optional().describe('Only companies with attendees in this event'),
                limit: z.number().int().min(1).max(500).default(100).describe('Max results'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const where: any = {}
                if (args.search) where.name = { contains: args.search, mode: 'insensitive' }
                if (args.region) where.region = { contains: args.region, mode: 'insensitive' }
                if (args.eventId) {
                    const eid = await resolveEventId(args.eventId)
                    if (!eid) return err('Event not found')
                    where.attendees = { some: { events: { some: { id: eid } } } }
                }
                const companies = await prisma.company.findMany({
                    where,
                    orderBy: { name: 'asc' },
                    take: args.limit,
                    include: { _count: { select: { attendees: true } } },
                })
                return ok(companies)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'get_company',
        {
            title: 'Get Company',
            description: 'Get a single company by id or name.',
            inputSchema: {
                id: z.string().optional().describe('Company id'),
                name: z.string().optional().describe('Company name (partial match)'),
                attendeeLimit: z.number().int().min(1).max(200).default(50).describe('Max attendees to include in response'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            if (!args.id && !args.name) return err('Either id or name is required')
            try {
                const company = await prisma.company.findFirst({
                    where: args.id
                        ? { id: args.id }
                        : { name: { contains: args.name, mode: 'insensitive' } },
                    include: {
                        _count: { select: { attendees: true } },
                        attendees: {
                            select: { id: true, name: true, email: true, title: true },
                            take: args.attendeeLimit,
                        },
                    },
                })
                if (!company) return err('Company not found')
                return ok(company)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'list_meetings',
        {
            title: 'List Meetings',
            description: 'List meetings for an event. Supports rich filtering.',
            inputSchema: {
                eventId: z.string().describe('Event id or slug (required)'),
                status: z.enum(['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED']).optional(),
                date: z.string().optional().describe('Filter by specific date (YYYY-MM-DD)'),
                dateFrom: z.string().optional().describe('Filter meetings on or after this date (YYYY-MM-DD)'),
                dateTo: z.string().optional().describe('Filter meetings on or before this date (YYYY-MM-DD)'),
                roomId: z.string().optional().describe('Filter by room id'),
                companyId: z.string().optional().describe('Filter meetings where at least one attendee belongs to this company'),
                search: z.string().optional().describe('Search in title, purpose, or attendee name'),
                limit: z.number().int().min(1).max(500).default(100).describe('Max results'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const eid = await resolveEventId(args.eventId)
                if (!eid) return err('Event not found')

                const where: any = { eventId: eid }
                if (args.status) where.status = args.status
                if (args.date) {
                    where.date = args.date
                } else if (args.dateFrom || args.dateTo) {
                    where.date = {}
                    if (args.dateFrom) where.date.gte = args.dateFrom
                    if (args.dateTo) where.date.lte = args.dateTo
                }
                if (args.roomId) where.roomId = args.roomId
                if (args.companyId) where.attendees = { some: { companyId: args.companyId } }
                if (args.search) {
                    where.OR = [
                        { title: { contains: args.search, mode: 'insensitive' } },
                        { purpose: { contains: args.search, mode: 'insensitive' } },
                        { attendees: { some: { name: { contains: args.search, mode: 'insensitive' } } } },
                    ]
                }

                const meetings = await prisma.meeting.findMany({
                    where,
                    include: {
                        room: { select: { id: true, name: true } },
                        attendees: { select: { id: true, name: true, title: true, type: true } },
                    },
                    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
                    take: args.limit,
                })
                return ok(meetings)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'get_meeting',
        {
            title: 'Get Meeting',
            description: 'Get a single meeting by id.',
            inputSchema: {
                id: z.string().describe('Meeting id'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const meeting = await prisma.meeting.findUnique({
                    where: { id: args.id },
                    include: {
                        room: true,
                        attendees: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                title: true,
                                type: true,
                                seniorityLevel: true,
                                company: { select: { id: true, name: true } },
                            },
                        },
                    },
                })
                if (!meeting) return err('Meeting not found')
                return ok(meeting)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'list_rooms',
        {
            title: 'List Rooms',
            description: 'List all rooms for an event.',
            inputSchema: {
                eventId: z.string().describe('Event id or slug'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const eid = await resolveEventId(args.eventId)
                if (!eid) return err('Event not found')
                const rooms = await prisma.room.findMany({
                    where: { eventId: eid },
                    orderBy: { name: 'asc' },
                })
                return ok(rooms)
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'get_roi_targets',
        {
            title: 'Get ROI Targets',
            description: 'Get ROI targets and actuals for an event.',
            inputSchema: {
                eventId: z.string().describe('Event id or slug'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const eid = await resolveEventId(args.eventId)
                if (!eid) return err('Event not found')
                const targets = await prisma.eventROITargets.findUnique({
                    where: { eventId: eid },
                    include: { targetCompanies: { select: { id: true, name: true } } },
                })
                return ok(targets ?? { message: 'No ROI targets set for this event' })
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'get_system_settings',
        {
            title: 'Get System Settings',
            description: 'Get global system settings: default tags, meeting types, attendee types, and region types.',
            inputSchema: {},
        },
        async (_args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const settings = await prisma.systemSettings.findFirst()
                return ok(settings ?? { message: 'No system settings configured' })
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'get_event_summary',
        {
            title: 'Get Event Summary',
            description: 'Get a rolled-up summary for an event: meeting status counts, attendee type breakdown, top companies by attendee count, and ROI actuals vs targets. Ideal for pipeline analysis without multiple round-trips.',
            inputSchema: {
                eventId: z.string().describe('Event id or slug'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            try {
                const eid = await resolveEventId(args.eventId)
                if (!eid) return err('Event not found')

                const [event, meetingCounts, attendeeCounts, roiTargets, topCompanies] = await Promise.all([
                    prisma.event.findUnique({
                        where: { id: eid },
                        select: { id: true, name: true, slug: true, status: true, startDate: true, endDate: true, region: true },
                    }),
                    prisma.meeting.groupBy({ by: ['status'], where: { eventId: eid }, _count: { status: true } }),
                    prisma.attendee.groupBy({ by: ['type'], where: { events: { some: { id: eid } } }, _count: { type: true } }),
                    prisma.eventROITargets.findUnique({ where: { eventId: eid } }),
                    prisma.company.findMany({
                        where: { attendees: { some: { events: { some: { id: eid } } } } },
                        select: { id: true, name: true, _count: { select: { attendees: true } } },
                        orderBy: { attendees: { _count: 'desc' } },
                        take: 10,
                    }),
                ])

                return ok({
                    event,
                    meetings: Object.fromEntries(meetingCounts.map(r => [r.status, r._count.status])),
                    attendees: Object.fromEntries(attendeeCounts.map(r => [r.type ?? 'unknown', r._count.type])),
                    roi: roiTargets,
                    topCompaniesByAttendeeCount: topCompanies,
                })
            } catch (e: any) {
                return err(e.message)
            }
        }
    )
}
