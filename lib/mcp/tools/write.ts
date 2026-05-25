import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { resolveEventId } from '@/lib/events'
import { canWrite } from '@/lib/mcp/auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRole(extra: unknown): string {
    return (extra as Record<string, unknown>)?.role as string ?? ''
}

function forbidden() {
    return {
        content: [{ type: 'text' as const, text: 'Forbidden: requires root role' }],
        isError: true,
    }
}

function err(msg: string) {
    return {
        content: [{ type: 'text' as const, text: `Error: ${msg}` }],
        isError: true,
    }
}

function ok(data: unknown, note?: string) {
    const text = note
        ? `${note}\n\n${JSON.stringify(data, null, 2)}`
        : JSON.stringify(data, null, 2)
    return { content: [{ type: 'text' as const, text }] }
}

// ── Write Tools ───────────────────────────────────────────────────────────────

export function registerWriteTools(server: McpServer) {

    server.registerTool(
        'create_event',
        {
            title: 'Create Event',
            description: 'Create a new event. Slug is auto-generated from the name.',
            inputSchema: {
                name: z.string().describe('Event name'),
                startDate: z.string().describe('Start date (ISO 8601, e.g. 2025-09-15)'),
                endDate: z.string().describe('End date (ISO 8601)'),
                status: z.enum(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']).default('PIPELINE'),
                region: z.string().optional(),
                address: z.string().optional(),
                url: z.string().optional(),
                budget: z.number().optional(),
                timezone: z.string().optional(),
                description: z.string().optional(),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const randomSuffix = Math.random().toString(36).substring(2, 8)
                const slug = `${args.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 48)}-${randomSuffix}`

                const settings = await prisma.systemSettings.findFirst()
                const event = await prisma.event.create({
                    data: {
                        name: args.name,
                        slug,
                        startDate: new Date(args.startDate),
                        endDate: new Date(args.endDate),
                        status: args.status,
                        region: args.region,
                        address: args.address,
                        url: args.url,
                        budget: args.budget,
                        timezone: args.timezone,
                        description: args.description,
                        tags: settings?.defaultTags ?? [],
                        meetingTypes: settings?.defaultMeetingTypes ?? [],
                        attendeeTypes: settings?.defaultAttendeeTypes ?? [],
                        authorizedUserIds: [],
                    },
                })
                return ok(event, 'Event created.')
            } catch (e: any) {
                if (e.code === 'P2002') return err('An event with this name or slug already exists')
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'update_event',
        {
            title: 'Update Event',
            description: 'Update fields on an existing event. Only provided fields are changed.',
            inputSchema: {
                id: z.string().describe('Event id or slug'),
                name: z.string().optional(),
                startDate: z.string().optional().describe('ISO 8601 date'),
                endDate: z.string().optional().describe('ISO 8601 date'),
                status: z.enum(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']).optional(),
                region: z.string().optional(),
                address: z.string().optional(),
                url: z.string().optional(),
                budget: z.number().nullable().optional(),
                timezone: z.string().optional(),
                description: z.string().optional(),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const eid = await resolveEventId(args.id)
                if (!eid) return err('Event not found')

                const data: any = {}
                if (args.name !== undefined) data.name = args.name
                if (args.startDate !== undefined) data.startDate = new Date(args.startDate)
                if (args.endDate !== undefined) data.endDate = new Date(args.endDate)
                if (args.status !== undefined) data.status = args.status
                if (args.region !== undefined) data.region = args.region
                if (args.address !== undefined) data.address = args.address
                if (args.url !== undefined) data.url = args.url
                if (args.budget !== undefined) data.budget = args.budget
                if (args.timezone !== undefined) data.timezone = args.timezone
                if (args.description !== undefined) data.description = args.description

                const event = await prisma.event.update({ where: { id: eid }, data })
                return ok(event, 'Event updated.')
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'create_meeting',
        {
            title: 'Create Meeting',
            description: 'Create a meeting within an event. Room conflicts cause an error; attendee conflicts return a warning.',
            inputSchema: {
                eventId: z.string().describe('Event id or slug'),
                title: z.string().describe('Meeting title'),
                date: z.string().optional().describe('Date (YYYY-MM-DD)'),
                startTime: z.string().optional().describe('Start time (HH:MM)'),
                endTime: z.string().optional().describe('End time (HH:MM)'),
                roomId: z.string().optional(),
                attendeeIds: z.array(z.string()).optional(),
                status: z.enum(['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED']).default('PIPELINE'),
                purpose: z.string().optional(),
                location: z.string().optional(),
                meetingType: z.string().optional(),
                otherDetails: z.string().optional(),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const eid = await resolveEventId(args.eventId)
                if (!eid) return err('Event not found')
                if (!args.title.trim()) return err('Title is required')

                // Time validation
                if (args.date && args.startTime && args.endTime) {
                    const start = new Date(`${args.date}T${args.startTime}`)
                    const end = new Date(`${args.date}T${args.endTime}`)
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) return err('Invalid date or time')
                    if (start >= end) return err('End time must be after start time')
                }

                // Room conflict detection
                if (args.roomId && args.date && args.startTime && args.endTime) {
                    const conflicts = await prisma.meeting.findMany({
                        where: {
                            eventId: eid,
                            roomId: args.roomId,
                            date: args.date,
                            OR: [{ startTime: { lt: args.endTime }, endTime: { gt: args.startTime } }],
                        },
                    })
                    if (conflicts.length > 0) return err('Room is already booked for this time slot')
                }

                // Attendee conflict warning (non-blocking)
                let warning: string | undefined
                if (args.attendeeIds?.length && args.date && args.startTime && args.endTime) {
                    const attendeeConflicts = await prisma.meeting.findMany({
                        where: {
                            eventId: eid,
                            attendees: { some: { id: { in: args.attendeeIds } } },
                            date: args.date,
                            OR: [{ startTime: { lt: args.endTime }, endTime: { gt: args.startTime } }],
                        },
                        include: { attendees: true },
                    })
                    if (attendeeConflicts.length > 0) {
                        const busy = new Map<string, string[]>()
                        attendeeConflicts.forEach((m: any) => {
                            m.attendees.forEach((a: any) => {
                                if (args.attendeeIds!.includes(a.id)) {
                                    busy.set(a.name, [...(busy.get(a.name) ?? []), m.title])
                                }
                            })
                        })
                        warning = `Warning — attendees already booked: ${Array.from(busy.entries())
                            .map(([n, ts]) => `${n} (in: ${ts.join(', ')})`)
                            .join('; ')}`
                    }
                }

                const meetingData: any = {
                    title: args.title,
                    status: args.status,
                    date: args.date,
                    startTime: args.startTime,
                    endTime: args.endTime,
                    purpose: args.purpose,
                    location: args.location,
                    meetingType: args.meetingType,
                    otherDetails: args.otherDetails,
                    createdBy: 'mcp-agent',
                    eventId: eid,
                }
                if (args.roomId) meetingData.roomId = args.roomId
                if (args.status === 'CANCELED') {
                    meetingData.roomId = null
                    meetingData.location = null
                }
                if (args.attendeeIds?.length) {
                    meetingData.attendees = { connect: args.attendeeIds.map((id: string) => ({ id })) }
                    // Auto-link attendees to event (existing app pattern)
                    await prisma.event.update({
                        where: { id: eid },
                        data: { attendees: { connect: args.attendeeIds.map((id: string) => ({ id })) } },
                    })
                }

                const meeting = await prisma.meeting.create({
                    data: meetingData,
                    include: { room: true, attendees: true },
                })
                return ok(meeting, warning ? `Meeting created. ${warning}` : 'Meeting created.')
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'update_meeting',
        {
            title: 'Update Meeting',
            description: 'Update a meeting. Always increments the calendar sequence number to notify calendar clients.',
            inputSchema: {
                id: z.string().describe('Meeting id'),
                title: z.string().optional(),
                date: z.string().optional().describe('Date (YYYY-MM-DD)'),
                startTime: z.string().optional().describe('Start time (HH:MM)'),
                endTime: z.string().optional().describe('End time (HH:MM)'),
                roomId: z.string().nullable().optional().describe('Room id (null to clear)'),
                attendeeIds: z.array(z.string()).optional().describe('Full attendee list (replaces existing)'),
                status: z.enum(['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED']).optional(),
                purpose: z.string().optional(),
                location: z.string().nullable().optional(),
                meetingType: z.string().optional(),
                otherDetails: z.string().optional(),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const existing = await prisma.meeting.findUnique({ where: { id: args.id } })
                if (!existing) return err('Meeting not found')
                if (args.title !== undefined && !args.title.trim()) return err('Title is required')

                // Resolve effective time values for validation and conflict check
                const date = args.date ?? existing.date
                const startTime = args.startTime ?? existing.startTime
                const endTime = args.endTime ?? existing.endTime
                if (date && startTime && endTime) {
                    const start = new Date(`${date}T${startTime}`)
                    const end = new Date(`${date}T${endTime}`)
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) return err('Invalid date or time')
                    if (start >= end) return err('End time must be after start time')
                }

                // Room conflict check (exclude current meeting)
                const roomId = args.roomId !== undefined ? args.roomId : existing.roomId
                if (roomId && date && startTime && endTime) {
                    const conflicts = await prisma.meeting.findMany({
                        where: {
                            roomId,
                            id: { not: args.id },
                            date,
                            OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
                        },
                    })
                    if (conflicts.length > 0) return err('Room is already booked for this time slot')
                }

                const updateData: any = {}
                if (args.title !== undefined) updateData.title = args.title
                if (args.date !== undefined) updateData.date = args.date
                if (args.startTime !== undefined) updateData.startTime = args.startTime
                if (args.endTime !== undefined) updateData.endTime = args.endTime
                if (args.roomId !== undefined) updateData.roomId = args.roomId ?? null
                if (args.purpose !== undefined) updateData.purpose = args.purpose
                if (args.location !== undefined) updateData.location = args.location ?? null
                if (args.meetingType !== undefined) updateData.meetingType = args.meetingType
                if (args.otherDetails !== undefined) updateData.otherDetails = args.otherDetails
                if (args.status !== undefined) {
                    updateData.status = args.status
                    if (args.status === 'CANCELED') {
                        updateData.roomId = null
                        updateData.location = null
                    }
                }
                if (args.attendeeIds !== undefined) {
                    updateData.attendees = {
                        set: [],
                        connect: args.attendeeIds.map((id: string) => ({ id })),
                    }
                    if (args.attendeeIds.length > 0 && existing.eventId) {
                        await prisma.event.update({
                            where: { id: existing.eventId },
                            data: { attendees: { connect: args.attendeeIds.map((id: string) => ({ id })) } },
                        })
                    }
                }

                await prisma.meeting.update({ where: { id: args.id }, data: updateData })

                // Always increment sequence so calendar clients recognise the update
                const meeting = await prisma.meeting.update({
                    where: { id: args.id },
                    data: { sequence: { increment: 1 } },
                    include: { room: true, attendees: true },
                })
                return ok(meeting, 'Meeting updated.')
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'cancel_meeting',
        {
            title: 'Cancel Meeting',
            description: 'Cancel a meeting: sets status to CANCELED, clears room and location, increments sequence.',
            inputSchema: {
                id: z.string().describe('Meeting id'),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const existing = await prisma.meeting.findUnique({ where: { id: args.id } })
                if (!existing) return err('Meeting not found')

                const meeting = await prisma.meeting.update({
                    where: { id: args.id },
                    data: {
                        status: 'CANCELED',
                        roomId: null,
                        location: null,
                        sequence: { increment: 1 },
                    },
                    include: { room: true, attendees: true },
                })
                return ok(meeting, 'Meeting cancelled.')
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'create_attendee',
        {
            title: 'Create Attendee',
            description: 'Create an attendee and optionally add them to an event.',
            inputSchema: {
                name: z.string().describe('Full name'),
                email: z.string().describe('Email address (must be unique)'),
                title: z.string().optional().describe('Job title'),
                bio: z.string().optional(),
                linkedin: z.string().optional(),
                type: z.string().optional(),
                companyId: z.string().optional().describe('Company id to link'),
                companyName: z.string().optional().describe('Company name to look up and link (ignored if companyId given)'),
                eventId: z.string().optional().describe('Event id or slug to add attendee to'),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                // Resolve company
                let companyId = args.companyId
                if (!companyId && args.companyName) {
                    const company = await prisma.company.findFirst({
                        where: { name: { contains: args.companyName, mode: 'insensitive' } },
                        select: { id: true },
                    })
                    companyId = company?.id
                }

                const data: any = {
                    name: args.name,
                    email: args.email,
                    title: args.title,
                    bio: args.bio,
                    linkedin: args.linkedin,
                    type: args.type,
                }
                if (companyId) data.company = { connect: { id: companyId } }
                if (args.eventId) {
                    const eid = await resolveEventId(args.eventId)
                    if (!eid) return err('Event not found')
                    data.events = { connect: { id: eid } }
                }

                const attendee = await prisma.attendee.create({
                    data,
                    include: { company: true },
                })
                return ok(attendee, 'Attendee created.')
            } catch (e: any) {
                if (e.code === 'P2002') return err('An attendee with this email already exists')
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'update_attendee',
        {
            title: 'Update Attendee',
            description: 'Update attendee fields. Only provided fields are changed.',
            inputSchema: {
                id: z.string().describe('Attendee id'),
                name: z.string().optional(),
                email: z.string().optional(),
                title: z.string().optional(),
                bio: z.string().optional(),
                linkedin: z.string().optional(),
                type: z.string().optional(),
                companyId: z.string().nullable().optional().describe('Company id to link; null to unlink'),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const existing = await prisma.attendee.findUnique({ where: { id: args.id } })
                if (!existing) return err('Attendee not found')

                const data: any = {}
                if (args.name !== undefined) data.name = args.name
                if (args.email !== undefined) data.email = args.email
                if (args.title !== undefined) data.title = args.title
                if (args.bio !== undefined) data.bio = args.bio
                if (args.linkedin !== undefined) data.linkedin = args.linkedin
                if (args.type !== undefined) data.type = args.type
                if (args.companyId !== undefined) {
                    data.company = args.companyId
                        ? { connect: { id: args.companyId } }
                        : { disconnect: true }
                }

                const attendee = await prisma.attendee.update({
                    where: { id: args.id },
                    data,
                    include: { company: true },
                })
                return ok(attendee, 'Attendee updated.')
            } catch (e: any) {
                if (e.code === 'P2002') return err('An attendee with this email already exists')
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'create_company',
        {
            title: 'Create Company',
            description: 'Create a company. Name must be unique (case-insensitive).',
            inputSchema: {
                name: z.string().describe('Company name'),
                description: z.string().optional(),
                pipelineValue: z.number().optional(),
                region: z.string().optional(),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                // Enforce case-insensitive uniqueness (matching existing API behaviour)
                const existing = await prisma.company.findFirst({
                    where: { name: { equals: args.name.trim(), mode: 'insensitive' } },
                })
                if (existing) return err('A company with this name already exists')

                const company = await prisma.company.create({
                    data: {
                        name: args.name.trim(),
                        description: args.description ?? null,
                        pipelineValue: args.pipelineValue ?? null,
                        region: args.region ?? null,
                    },
                    include: { _count: { select: { attendees: true } } },
                })
                return ok(company, 'Company created.')
            } catch (e: any) {
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'update_company',
        {
            title: 'Update Company',
            description: 'Update company fields. Only provided fields are changed.',
            inputSchema: {
                id: z.string().describe('Company id'),
                name: z.string().optional(),
                description: z.string().nullable().optional(),
                pipelineValue: z.number().nullable().optional(),
                region: z.string().nullable().optional(),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const existing = await prisma.company.findUnique({ where: { id: args.id } })
                if (!existing) return err('Company not found')

                const data: any = {}
                if (args.name !== undefined) data.name = args.name.trim()
                if (args.description !== undefined) data.description = args.description
                if (args.pipelineValue !== undefined) data.pipelineValue = args.pipelineValue
                if (args.region !== undefined) data.region = args.region

                const company = await prisma.company.update({
                    where: { id: args.id },
                    data,
                    include: { _count: { select: { attendees: true } } },
                })
                return ok(company, 'Company updated.')
            } catch (e: any) {
                if (e.code === 'P2002') return err('A company with this name already exists')
                return err(e.message)
            }
        }
    )

    server.registerTool(
        'update_roi_targets',
        {
            title: 'Update ROI Targets',
            description: 'Upsert ROI targets for an event. Creates if none exist, updates otherwise.',
            inputSchema: {
                eventId: z.string().describe('Event id or slug'),
                expectedPipeline: z.number().nullable().optional(),
                winRate: z.number().min(0).max(100).nullable().optional().describe('Win rate as a percentage (0-100)'),
                expectedRevenue: z.number().nullable().optional(),
                targetCustomerMeetings: z.number().int().nullable().optional(),
                targetErta: z.number().int().nullable().optional(),
                targetSpeaking: z.number().int().nullable().optional(),
                targetMediaPR: z.number().int().nullable().optional(),
                targetEventScans: z.number().int().nullable().optional(),
                marketingPlan: z.string().nullable().optional(),
                actualErta: z.number().int().nullable().optional(),
                actualSpeaking: z.number().int().nullable().optional(),
                actualMediaPR: z.number().int().nullable().optional(),
                actualEventScans: z.number().int().nullable().optional(),
                actualCost: z.number().nullable().optional(),
            },
        },
        async (args, { authInfo }) => {
            if (!canWrite(getRole(authInfo?.extra))) return forbidden()
            try {
                const eid = await resolveEventId(args.eventId)
                if (!eid) return err('Event not found')

                const data: any = {}
                for (const [k, v] of Object.entries(args)) {
                    if (k !== 'eventId' && v !== undefined) data[k] = v
                }

                const targets = await prisma.eventROITargets.upsert({
                    where: { eventId: eid },
                    create: { eventId: eid, ...data },
                    update: data,
                    include: { targetCompanies: { select: { id: true, name: true } } },
                })
                return ok(targets, 'ROI targets updated.')
            } catch (e: any) {
                return err(e.message)
            }
        }
    )
}
