import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, AuthContext } from '@/lib/with-auth'
import { hasEventAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

const getHandler = withAuth(
    async (
        request: Request,
        { params, authCtx }: { params: Promise<Record<string, string>>; authCtx: AuthContext }
    ) => {
        const id = (await params).id
        try {
            const room = await prisma.room.findUnique({
                where: { id },
                include: {
                    meetings: {
                        include: {
                            room: true,
                            attendees: true,
                        },
                        orderBy: {
                            startTime: 'asc',
                        },
                    },
                },
            })

            if (!room) {
                return NextResponse.json({ error: 'Room not found' }, { status: 404 })
            }

            // Event access check
            if (room.eventId) {
                const event = await prisma.event.findUnique({
                    where: { id: room.eventId },
                    select: { id: true, authorizedUserIds: true, status: true }
                })
                if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
                }
            }

            return NextResponse.json(room)
        } catch (error) {
            return NextResponse.json({ error: 'Failed to fetch briefing data' }, { status: 500 })
        }
    },
    { requireAuth: true }
)

export const GET = getHandler as any
