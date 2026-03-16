import prisma from '@/lib/prisma'
import { sendCalendarInvites } from '@/lib/calendar-sync'
import { getROITargets, getROIActuals } from '@/lib/actions/roi'
import type { ROITargetsInput } from '@/lib/actions/roi'

// ─── Meetings ────────────────────────────────────────────────────────────────

export interface GetMeetingsArgs {
  date?: string
  roomId?: string
  search?: string
  statuses?: string[]
  tags?: string[]
  meetingTypes?: string[]
  attendeeIds?: string[]
  isApproved?: boolean
  calendarInviteSent?: boolean
}

export async function getMeetingsOp(eventId: string, args: GetMeetingsArgs) {
  const { date, roomId, search, statuses, tags, meetingTypes, attendeeIds, isApproved, calendarInviteSent } = args
  const where: any = { eventId }

  if (date) where.date = date
  if (roomId) where.roomId = roomId

  if (statuses && statuses.length > 0) where.status = { in: statuses }
  if (tags && tags.length > 0) where.tags = { hasSome: tags }
  if (meetingTypes && meetingTypes.length > 0) where.meetingType = { in: meetingTypes }
  if (attendeeIds && attendeeIds.length > 0) {
    where.attendees = {
      some: {
        id: { in: attendeeIds }
      }
    }
  }

  if (isApproved !== undefined) where.isApproved = isApproved
  if (calendarInviteSent !== undefined) where.calendarInviteSent = calendarInviteSent

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { purpose: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
      { otherDetails: { contains: search, mode: 'insensitive' } },
      { attendees: { some: { name: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const meetings = await prisma.meeting.findMany({
    where,
    include: { room: true, attendees: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  return { meetings }
}

export interface CreateMeetingArgs {
  title: string
  purpose?: string
  date: string
  startTime: string
  endTime: string
  roomId?: string
  attendeeEmails?: string[]
}

export async function createMeetingOp(eventId: string, args: CreateMeetingArgs) {
  const { title, purpose, date, startTime, endTime, roomId, attendeeEmails } = args

  if (roomId) {
    const roomConflicts = await prisma.meeting.findMany({
      where: {
        eventId,
        roomId,
        date,
        OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
      },
    })
    if (roomConflicts.length > 0) return { error: 'Room is already booked for this time slot.' }
  }

  let attendeeIds: string[] = []
  if (attendeeEmails && attendeeEmails.length > 0) {
    const attendees = await prisma.attendee.findMany({
      where: {
        email: { in: attendeeEmails },
        events: { some: { id: eventId } }
      },
    })
    attendeeIds = attendees.map(a => a.id)
  }

  try {
    const meeting = await prisma.meeting.create({
      data: {
        title,
        purpose,
        date,
        startTime,
        endTime,
        roomId,
        status: 'PIPELINE',
        eventId,
        attendees: { connect: attendeeIds.map(id => ({ id })) },
      },
      include: { room: true, attendees: true },
    })

    if (meeting.date && meeting.startTime && meeting.endTime) {
      sendCalendarInvites(meeting as any).catch(console.error)
    }

    return { message: `Meeting created successfully: ${meeting.id}`, meetingId: meeting.id }
  } catch (error) {
    console.error('Error creating meeting:', error)
    return { error: 'Failed to create meeting' }
  }
}

export async function cancelMeetingOp(eventId: string, meetingId: string) {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    })

    if (!meeting || meeting.eventId !== eventId) {
      return { error: 'Meeting not found or does not belong to this event.' }
    }

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'CANCELED',
        roomId: null,
        location: null,
        sequence: { increment: 1 }
      },
    })
    return { message: `Meeting ${meetingId} canceled successfully` }
  } catch (e: any) {
    return { error: `Error canceling meeting: ${e.message}` }
  }
}

// ─── Attendees ────────────────────────────────────────────────────────────────

export interface GetAttendeesArgs {
  search?: string
  company?: string
  title?: string
  types?: string[]
  isExternal?: boolean
  email?: string
}

export async function getAttendeesOp(eventId: string, args: GetAttendeesArgs) {
  const { search, company, title, types, isExternal, email } = args
  const where: any = {
    events: { some: { id: eventId } }
  }
  if (company) where.company = { name: { contains: company, mode: 'insensitive' } }
  if (title) where.title = { contains: title, mode: 'insensitive' }
  if (email) where.email = { contains: email, mode: 'insensitive' }
  if (types && types.length > 0) where.type = { in: types }
  if (isExternal !== undefined) where.isExternal = isExternal

  if (search) {
    const searchOr = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { company: { name: { contains: search, mode: 'insensitive' } } },
      { bio: { contains: search, mode: 'insensitive' } },
    ]
    // Use AND to combine existing scalar filters with OR search,
    // preventing the OR clause from silently dropping company/title/email filters.
    where.AND = [{ OR: searchOr }]
  }

  const attendees = await prisma.attendee.findMany({
    where,
    take: 50,
    orderBy: { name: 'asc' },
    include: { company: true }
  })
  return { attendees }
}

export interface AddAttendeeArgs {
  name: string
  email: string
  title: string
  company: string
}

export async function addAttendeeOp(eventId: string, args: AddAttendeeArgs) {
  const { name, email, title, company } = args

  try {
    // Resolve or create company
    let companyRecord = await prisma.company.findFirst({
      where: { name: { equals: company, mode: 'insensitive' } }
    })
    if (!companyRecord) {
      companyRecord = await prisma.company.create({ data: { name: company } })
    }

    // Check if attendee already exists globally (email is unique across all events)
    const existing = await prisma.attendee.findUnique({ where: { email } })

    if (existing) {
      // Connect to this event if not already connected
      const alreadyConnected = await prisma.attendee.findFirst({
        where: { id: existing.id, events: { some: { id: eventId } } }
      })
      if (!alreadyConnected) {
        await prisma.attendee.update({
          where: { id: existing.id },
          data: { events: { connect: { id: eventId } } }
        })
      }
      return { message: `Attendee ${existing.name} connected to event`, attendeeId: existing.id }
    }

    // Create new attendee (use dynamic import for enrichment)
    const { findLinkedInUrl, generateBio } = await import('@/lib/enrichment')
    let linkedin: string | undefined
    let bio: string | undefined
    const foundUrl = await findLinkedInUrl(name, company)
    if (foundUrl) linkedin = foundUrl
    if (linkedin) {
      const generatedBio = await generateBio(name, company, linkedin)
      if (generatedBio) bio = generatedBio
    }

    const attendee = await prisma.attendee.create({
      data: {
        name,
        email,
        title,
        companyId: companyRecord.id,
        linkedin,
        bio,
        events: { connect: { id: eventId } }
      }
    })
    return { message: `Attendee added: ${attendee.name} (${attendee.email})`, attendeeId: attendee.id }
  } catch (e: any) {
    return { error: e.message }
  }
}

export interface CheckAttendeeAvailabilityArgs {
  attendeeEmail: string
  date: string
  startTime: string
  endTime: string
}

export async function checkAttendeeAvailabilityOp(eventId: string, args: CheckAttendeeAvailabilityArgs) {
  const { attendeeEmail, date, startTime, endTime } = args

  const attendee = await prisma.attendee.findFirst({
    where: {
      email: attendeeEmail,
      events: { some: { id: eventId } }
    },
  })

  if (!attendee) {
    return { error: `Attendee with email ${attendeeEmail} not found in this event.` }
  }

  const conflicts = await prisma.meeting.findMany({
    where: {
      eventId,
      attendees: { some: { id: attendee.id } },
      date,
      status: { not: 'CANCELED' },
      OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
    },
  })

  if (conflicts.length > 0) {
    return {
      status: 'Busy',
      conflicts: conflicts.map(c => `${c.startTime}-${c.endTime}: ${c.title}`)
    }
  }

  return { status: 'Available' }
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export interface GetRoomsArgs {
  search?: string
  minCapacity?: number
  maxCapacity?: number
}

export async function getRoomsOp(eventId: string, args: GetRoomsArgs) {
  const { search, minCapacity, maxCapacity } = args
  const where: any = { eventId }
  if (search) where.name = { contains: search, mode: 'insensitive' }

  if (minCapacity !== undefined || maxCapacity !== undefined) {
    where.capacity = {}
    if (minCapacity !== undefined) where.capacity.gte = minCapacity
    if (maxCapacity !== undefined) where.capacity.lte = maxCapacity
  }

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: 'asc' }
  })
  return { rooms }
}

export interface GetRoomAvailabilityArgs {
  roomId: string
  date: string
  startTime: string
  endTime: string
}

export async function getRoomAvailabilityOp(eventId: string, args: GetRoomAvailabilityArgs) {
  const { roomId, date, startTime, endTime } = args

  const conflicts = await prisma.meeting.findMany({
    where: {
      eventId,
      roomId,
      date,
      status: { not: 'CANCELED' },
      OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
    },
  })
  const isAvailable = conflicts.length === 0
  return {
    isAvailable,
    details: isAvailable ? 'Room is available' : 'Room is occupied'
  }
}

// ─── ROI ──────────────────────────────────────────────────────────────────────

export async function getROITargetsOp(eventId: string) {
  const [targets, actuals] = await Promise.all([
    getROITargets(eventId),
    getROIActuals(eventId)
  ])
  return { targets, actuals }
}

export async function updateROITargetsOp(eventId: string, args: ROITargetsInput) {
  const { targetCompanyIds, targetCompanyNames, budget, requesterEmail, event, eventId: _eid, ...rest } = args as any

  if (budget !== undefined || requesterEmail !== undefined) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(budget !== undefined && { budget }),
        ...(requesterEmail !== undefined && { requesterEmail })
      }
    })
  }

  // Resolve company names → IDs (find or create)
  let resolvedIds: string[] = []
  if (targetCompanyNames && targetCompanyNames.length > 0) {
    for (const name of targetCompanyNames) {
      let company = await prisma.company.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } }
      })
      if (!company) {
        company = await prisma.company.create({ data: { name } })
      }
      resolvedIds.push(company.id)
    }
  }

  // Merge with any explicit targetCompanyIds (de-duplicate)
  const effectiveIds = targetCompanyIds !== undefined || resolvedIds.length > 0
    ? [...new Set([...(targetCompanyIds ?? []), ...resolvedIds])]
    : undefined

  const upsertData: any = { ...rest }
  if (effectiveIds !== undefined) {
    upsertData.targetCompanies = { set: effectiveIds.map((id: string) => ({ id })) }
  }

  return prisma.eventROITargets.upsert({
    where: { eventId },
    create: {
      event: { connect: { id: eventId } },
      ...rest,
      targetCompanies: effectiveIds
        ? { connect: effectiveIds.map((id: string) => ({ id })) }
        : undefined,
    },
    update: upsertData,
    include: { targetCompanies: true }
  })
}

// ─── Event ────────────────────────────────────────────────────────────────────

export async function getEventOp(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
    include: { roiTargets: true }
  })
}

// Search events by name — used when no eventId context is available.
// Returns id and slug so the caller can use them for subsequent ops.
export async function listEventsOp(args: { search?: string; userId: string; role: string }) {
  const { hasWriteAccess } = await import('@/lib/role-utils')
  const { Roles } = await import('@/lib/constants')

  const where: any = {}
  if (args.search) {
    where.OR = [
      { name: { contains: args.search, mode: 'insensitive' } },
      { slug: { contains: args.search, mode: 'insensitive' } },
    ]
  }

  // Non-privileged roles can only see events they're authorized for
  const isGlobal = hasWriteAccess(args.role) || args.role === Roles.Root || args.role === Roles.Marketing
  if (!isGlobal) {
    where.authorizedUserIds = { has: args.userId }
  }

  const events = await prisma.event.findMany({
    where,
    select: { id: true, name: true, slug: true, status: true, startDate: true },
    orderBy: { startDate: 'desc' },
    take: 10,
  })
  return { events }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

// NOTE: This function returns navigation URLs without any permission check.
// Callers are responsible for verifying write access before surfacing
// create/update URLs to end users.
export function getNavigationLinksOp(eventSlug: string, resource: string, action: string, id?: string) {
  const normalizedResource = resource.startsWith('meeting') ? 'meeting' : 'attendee'
  const slugToUse = eventSlug
  const baseUrl = `/events/${slugToUse}`

  if (action === 'create') {
    if (normalizedResource === 'meeting') return { url: `${baseUrl}/new-meeting` }
    if (normalizedResource === 'attendee') return { url: `${baseUrl}/attendees` }
  }

  if (action === 'update') {
    if (!id) return { error: 'ID is required for update action.' }
    if (normalizedResource === 'meeting') return { url: `${baseUrl}/dashboard?meetingId=${id}` }
    if (normalizedResource === 'attendee') return { url: `${baseUrl}/attendees?attendeeId=${id}` }
  }

  if (action === 'read') {
    if (!id) return { url: normalizedResource === 'meeting' ? `${baseUrl}/dashboard` : `${baseUrl}/attendees` }
    if (normalizedResource === 'meeting') return { url: `${baseUrl}/dashboard?meetingId=${id}` }
    if (normalizedResource === 'attendee') return { url: `${baseUrl}/attendees?attendeeId=${id}` }
  }

  return { error: 'Invalid resource or action.' }
}
