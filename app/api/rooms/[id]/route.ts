import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, AuthContext } from '@/lib/with-auth'
import { hasEventAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

const putHandler = withAuth(
    async (
        request: Request,
        { params, authCtx }: { params: Promise<Record<string, string>>; authCtx: AuthContext }
    ) => {
        const id = (await params).id
        try {
            const body = await request.json()
            const { name, capacity } = body

            const currentRoom = await prisma.room.findUnique({ where: { id }, select: { eventId: true } })

            if (!currentRoom) {
                return NextResponse.json({ error: 'Room not found' }, { status: 404 })
            }

            if (currentRoom.eventId) {
                const event = await prisma.event.findUnique({
                    where: { id: currentRoom.eventId },
                    select: { id: true, authorizedUserIds: true, status: true }
                })
                if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
                }
            }

            const room = await prisma.room.update({
                where: { id },
                data: {
                    name,
                    capacity: parseInt(capacity),
                },
            })

            return NextResponse.json(room)
        } catch (error) {
            return NextResponse.json({ error: 'Failed to update room' }, { status: 500 })
        }
    },
    { requireRole: 'write' }
)

const deleteHandler = withAuth(
    async (
        request: Request,
        { params, authCtx }: { params: Promise<Record<string, string>>; authCtx: AuthContext }
    ) => {
        const id = (await params).id
        try {
            const currentRoom = await prisma.room.findUnique({ where: { id }, select: { eventId: true } })

            if (!currentRoom) {
                return NextResponse.json({ error: 'Room not found' }, { status: 404 })
            }

            if (currentRoom.eventId) {
                const event = await prisma.event.findUnique({
                    where: { id: currentRoom.eventId },
                    select: { id: true, authorizedUserIds: true, status: true }
                })
                if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
                }
            }

            await prisma.room.delete({
                where: { id },
            })
            return NextResponse.json({ success: true })
        } catch (error) {
            return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 })
        }
    },
    { requireRole: 'write' }
)

export const PUT = putHandler as any
export const DELETE = deleteHandler as any
