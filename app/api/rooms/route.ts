import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { resolveEventId } from '@/lib/events'
import { withAuth, AuthContext } from '@/lib/with-auth'
import { hasEventAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

const getHandler = withAuth(
    async (request: Request, { authCtx }: { params: Promise<Record<string, string>>; authCtx: AuthContext }) => {
        try {
            const { searchParams } = new URL(request.url)
            const rawEventId = searchParams.get('eventId')
            const eventId = await resolveEventId(rawEventId || '')

            if (!eventId) {
                return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
            }

            const rooms = await prisma.room.findMany({
                where: { eventId },
                orderBy: {
                    name: 'asc',
                },
            })
            return NextResponse.json(rooms)
        } catch (error) {
            return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
        }
    },
    { requireEventAccess: true, eventIdSource: 'query', eventIdQueryParam: 'eventId' }
)

const postHandler = withAuth(
    async (request: Request, { authCtx }: { params: Promise<Record<string, string>>; authCtx: AuthContext }) => {
        try {
            const body = await request.json()

            const rawEventId = body.eventId
            const eventId = await resolveEventId(rawEventId)

            if (!eventId) {
                return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
            }

            // Event access check
            const event = await prisma.event.findFirst({
                where: { OR: [{ id: eventId }, { slug: eventId }] },
                select: { id: true, authorizedUserIds: true, status: true }
            })
            if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }

            // LOCK CHECK
            const { isEventEditable } = await import('@/lib/events')
            if (!await isEventEditable(eventId)) {
                return NextResponse.json({
                    error: 'Event has occurred and is read-only.'
                }, { status: 403 })
            }

            const room = await prisma.room.create({
                data: {
                    name: body.name,
                    capacity: parseInt(body.capacity),
                    eventId: eventId
                },
            })
            return NextResponse.json(room)
        } catch (error) {
            return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
        }
    },
    { requireRole: 'write' }
)

export const GET = getHandler as any
export const POST = postHandler as any
