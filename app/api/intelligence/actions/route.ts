import { NextResponse } from 'next/server'
import { verifyActionToken } from '@/lib/action-tokens'
import type {
  GetMeetingsArgs,
  CreateMeetingArgs,
  GetAttendeesArgs,
  AddAttendeeArgs,
  GetRoomsArgs,
  GetRoomAvailabilityArgs,
  CheckAttendeeAvailabilityArgs,
} from '@/lib/tools/ops'
import type { ROITargetsInput } from '@/lib/actions/roi'
import { hasWriteAccess } from '@/lib/role-utils'
import { hasEventAccess } from '@/lib/access'
import prisma from '@/lib/prisma'
import * as ops from '@/lib/tools/ops'

export const dynamic = 'force-dynamic'

const WRITE_TOOLS = new Set(['createMeeting', 'cancelMeeting', 'addAttendee', 'updateROITargets', 'updateMeeting', 'updateCompany'])

export async function POST(req: Request) {
  // Auth: verify action token
  const auth = req.headers.get('authorization') ?? ''
  const raw = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const token = verifyActionToken(raw)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { tool?: string; eventId?: string; args?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tool, eventId, args } = body
  if (!tool) {
    return NextResponse.json({ error: 'tool required' }, { status: 400 })
  }

  // listEvents is a collection-level tool that doesn't require an eventId
  if (tool === 'listEvents') {
    try {
      const result = await ops.listEventsOp({
        search: (args as { search?: string })?.search,
        userId: token.userId,
        role: token.role,
      })
      return NextResponse.json({ result })
    } catch (err: any) {
      console.error('actions error [listEvents]:', err)
      return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
    }
  }

  if (!eventId) {
    return NextResponse.json({ error: 'eventId required for this tool' }, { status: 400 })
  }

  // RBAC: check write access for write operations
  if (WRITE_TOOLS.has(tool) && !hasWriteAccess(token.role)) {
    return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 })
  }

  // Require explicit user confirmation for write operations
  if (WRITE_TOOLS.has(tool)) {
    const confirmed = (args as any)?.confirmed === true
    if (!confirmed) {
      return NextResponse.json({
        requires_confirmation: true,
        message: `Action "${tool}" will modify the database. Ask the user to confirm before proceeding, then call this tool again with confirmed=true.`,
        preview: { tool, eventId, args }
      })
    }
    // Strip confirmed flag before passing to ops
    if (args) delete (args as any).confirmed
  }

  // Resolve event (supports UUID or slug)
  const event = await prisma.event.findFirst({
    where: { OR: [{ id: eventId }, { slug: eventId }] },
    select: { id: true, slug: true, authorizedUserIds: true }
  })
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // RBAC: check per-event access
  if (!hasEventAccess(event, token.userId, token.role)) {
    return NextResponse.json({ error: 'Forbidden: no event access' }, { status: 403 })
  }

  try {
    let result: unknown
    const eid = event.id
    const a = args ?? {}

    switch (tool) {
      case 'getMeetings':
        result = await ops.getMeetingsOp(eid, a as GetMeetingsArgs)
        break
      case 'createMeeting':
        result = await ops.createMeetingOp(eid, a as unknown as CreateMeetingArgs)
        break
      case 'cancelMeeting':
        result = await ops.cancelMeetingOp(eid, (a as { meetingId: string }).meetingId)
        break
      case 'updateMeeting': {
        const { meetingId, ...updates } = a as { meetingId: string; [key: string]: unknown }
        if (!meetingId) return NextResponse.json({ error: 'meetingId required' }, { status: 400 })
        const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
        if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
        if (meeting.eventId !== eid) return NextResponse.json({ error: 'Meeting does not belong to this event' }, { status: 403 })
        const updated = await prisma.meeting.update({
          where: { id: meetingId },
          data: { ...updates, sequence: { increment: 1 } },
          include: { room: true, attendees: true }
        })
        result = updated
        break
      }
      case 'getAttendees':
        result = await ops.getAttendeesOp(eid, a as GetAttendeesArgs)
        break
      case 'addAttendee':
        result = await ops.addAttendeeOp(eid, a as unknown as AddAttendeeArgs)
        break
      case 'getRooms':
        result = await ops.getRoomsOp(eid, a as GetRoomsArgs)
        break
      case 'getRoomAvailability':
        result = await ops.getRoomAvailabilityOp(eid, a as unknown as GetRoomAvailabilityArgs)
        break
      case 'checkAttendeeAvailability':
        result = await ops.checkAttendeeAvailabilityOp(eid, a as unknown as CheckAttendeeAvailabilityArgs)
        break
      case 'getROITargets':
        result = await ops.getROITargetsOp(eid)
        break
      case 'updateROITargets':
        result = await ops.updateROITargetsOp(eid, a as ROITargetsInput)
        break
      case 'updateCompany': {
        // updateCompany is system-level (no per-event access check needed beyond what's already done)
        const { companyId, ...companyUpdates } = a as { companyId: string; [key: string]: unknown }
        if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
        const updatedCompany = await prisma.company.update({
          where: { id: companyId },
          data: companyUpdates
        })
        result = updatedCompany
        break
      }
      case 'getEvent':
        result = await ops.getEventOp(eid)
        break
      case 'getNavigationLinks':
        result = ops.getNavigationLinksOp(
          event.slug,
          (a as { resource: string }).resource,
          (a as { action: string }).action,
          (a as { id?: string }).id
        )
        break
      default:
        return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
    }

    return NextResponse.json({ result })
  } catch (err: any) {
    console.error(`actions error [${tool}]:`, err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
