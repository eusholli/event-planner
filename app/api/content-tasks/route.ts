import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { hasEventAccess } from '@/lib/access'
import { currentUser, clerkClient } from '@clerk/nextjs/server'
import { resolveEventId } from '@/lib/events'

function clerkUserName(u: { firstName?: string | null; lastName?: string | null; emailAddresses?: { emailAddress: string }[] }): string {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
    return name || u.emailAddresses?.[0]?.emailAddress || ''
}

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request) => {
    try {
        const { searchParams } = new URL(request.url)
        const rawEventId = searchParams.get('eventId')
        const assigneeId = searchParams.get('assigneeId')
        const statuses = searchParams.get('status')?.split(',').filter(Boolean)
        const contentTypes = searchParams.get('contentType')?.split(',').filter(Boolean)
        const tags = searchParams.get('tags')?.split(',').filter(Boolean)
        const from = searchParams.get('from')
        const to = searchParams.get('to')
        const search = searchParams.get('search')?.toLowerCase()

        const where: any = {}

        if (rawEventId) {
            const eventId = await resolveEventId(rawEventId)
            if (eventId) where.eventId = eventId
        }

        if (assigneeId) where.assigneeId = assigneeId
        if (statuses && statuses.length > 0) where.status = { in: statuses }
        if (contentTypes && contentTypes.length > 0) where.contentType = { in: contentTypes }
        if (tags && tags.length > 0) where.tags = { hasSome: tags }

        if (from || to) {
            where.dueDate = {}
            if (from) where.dueDate.gte = new Date(from)
            if (to) where.dueDate.lte = new Date(to)
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ]
        }

        const tasks = await prisma.contentTask.findMany({
            where,
            include: { event: { select: { id: true, name: true, slug: true } } },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })

        // Batch-resolve assignee names from Clerk
        const assigneeIds = [...new Set(tasks.map(t => t.assigneeId).filter(Boolean))] as string[]
        const nameMap: Record<string, string> = {}
        if (assigneeIds.length > 0) {
            try {
                const client = await clerkClient()
                const { data: clerkUsers } = await client.users.getUserList({ userId: assigneeIds, limit: assigneeIds.length })
                for (const u of clerkUsers) nameMap[u.id] = clerkUserName(u)
            } catch { /* non-fatal */ }
        }

        const result = tasks.map(t => ({
            ...t,
            assigneeName: t.assigneeId ? (nameMap[t.assigneeId] || null) : null,
        }))
        return NextResponse.json(result)
    } catch (error) {
        console.error('Failed to fetch content tasks:', error)
        return NextResponse.json({ error: 'Failed to fetch content tasks' }, { status: 500 })
    }
}) as any

export const POST = withAuth(async (request, { authCtx }) => {
    try {
        const body = await request.json()
        const {
            title,
            description,
            contentType,
            status = 'TODO',
            dueDate,
            tags = [],
            assigneeId,
            eventId: rawEventId,
        } = body

        if (!title || title.trim() === '') {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 })
        }

        let eventId: string | null = null
        if (rawEventId) {
            const resolved = await resolveEventId(rawEventId)
            if (!resolved) {
                return NextResponse.json({ error: 'Event not found' }, { status: 404 })
            }
            const event = await prisma.event.findUnique({
                where: { id: resolved },
                select: { id: true, authorizedUserIds: true, status: true },
            })
            if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
            eventId = resolved
        }

        const user = await currentUser()
        const createdBy = user?.emailAddresses[0]?.emailAddress ?? authCtx.userId

        const { notes, collaboratorIds = [] } = body

        const task = await prisma.contentTask.create({
            data: {
                title: title.trim(),
                description: description ?? null,
                notes: notes ?? null,
                contentType: contentType ?? null,
                status,
                dueDate: dueDate ? new Date(dueDate) : null,
                tags,
                assigneeId: assigneeId ?? null,
                collaboratorIds,
                eventId,
                createdBy,
            },
            include: { event: { select: { id: true, name: true, slug: true } } },
        })

        return NextResponse.json(task, { status: 201 })
    } catch (error) {
        console.error('Failed to create content task:', error)
        return NextResponse.json({ error: 'Failed to create content task' }, { status: 500 })
    }
}, { requireRole: 'create' }) as any
