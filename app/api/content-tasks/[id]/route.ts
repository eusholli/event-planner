import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, isOwnerOrCanWrite } from '@/lib/with-auth'
import { hasEventAccess } from '@/lib/access'
import { resolveEventId } from '@/lib/events'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_request, { params }) => {
    const id = (await params).id
    const task = await prisma.contentTask.findUnique({
        where: { id },
        include: { event: { select: { id: true, name: true, slug: true } } },
    })
    if (!task) return NextResponse.json({ error: 'Content task not found' }, { status: 404 })
    return NextResponse.json(task)
}) as any

export const PUT = withAuth(async (request, { params, authCtx }) => {
    const id = (await params).id
    try {
        const existing = await prisma.contentTask.findUnique({ where: { id } })
        if (!existing) return NextResponse.json({ error: 'Content task not found' }, { status: 404 })

        if (!(await isOwnerOrCanWrite(authCtx, existing.createdBy))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const data: any = {}

        if (body.title !== undefined) {
            if (!body.title || body.title.trim() === '') {
                return NextResponse.json({ error: 'Title is required' }, { status: 400 })
            }
            data.title = body.title.trim()
        }
        if (body.description !== undefined) data.description = body.description
        if (body.contentType !== undefined) data.contentType = body.contentType
        if (body.status !== undefined) data.status = body.status
        if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
        if (body.tags !== undefined) data.tags = body.tags
        if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId

        if (body.eventId !== undefined) {
            if (body.eventId === null || body.eventId === '') {
                data.eventId = null
            } else {
                const resolved = await resolveEventId(body.eventId)
                if (!resolved) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
                const event = await prisma.event.findUnique({
                    where: { id: resolved },
                    select: { id: true, authorizedUserIds: true, status: true },
                })
                if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
                }
                data.eventId = resolved
            }
        }

        const task = await prisma.contentTask.update({
            where: { id },
            data,
            include: { event: { select: { id: true, name: true, slug: true } } },
        })
        return NextResponse.json(task)
    } catch (error) {
        console.error('Failed to update content task:', error)
        return NextResponse.json({ error: 'Failed to update content task' }, { status: 500 })
    }
}) as any

export const DELETE = withAuth(async (_request, { params, authCtx }) => {
    const id = (await params).id
    const existing = await prisma.contentTask.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Content task not found' }, { status: 404 })
    if (!(await isOwnerOrCanWrite(authCtx, existing.createdBy))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.contentTask.delete({ where: { id } })
    return NextResponse.json({ success: true })
}) as any
