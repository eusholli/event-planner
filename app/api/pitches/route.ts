import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set(['title', 'modified', 'createdAt'] as const)
type SortBy = 'title' | 'modified' | 'createdAt'

export async function GET(request: Request) {
    if (!await canManageEvents()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim()
    const sortByRaw = searchParams.get('sortBy') ?? 'modified'
    const sortBy: SortBy = (SORTABLE.has(sortByRaw as SortBy) ? sortByRaw : 'modified') as SortBy
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))

    const where: Prisma.PitchWhereInput = search
        ? { title: { contains: search, mode: 'insensitive' } }
        : {}

    const [items, total] = await Promise.all([
        prisma.pitch.findMany({
            where,
            orderBy: { [sortBy]: sortDir },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                event: { select: { id: true, name: true, slug: true } },
                _count: { select: { targets: true, meetings: true } },
            },
        }),
        prisma.pitch.count({ where }),
    ])

    const result = items.map(p => ({
        id: p.id,
        title: p.title,
        pitchText: p.pitchText,
        tags: p.tags,
        createdAt: p.createdAt,
        modified: p.modified,
        targetsCount: p._count.targets,
        meetingsCount: p._count.meetings,
        event: p.event,
    }))

    return NextResponse.json({ items: result, total, page, limit })
}

export async function POST(request: Request) {
    const { userId } = await auth()
    if (!await canManageEvents()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const title: string | undefined = body?.title
    const pitchText: string = typeof body?.pitchText === 'string' ? body.pitchText : ''
    const tags: string[] = Array.isArray(body?.tags) ? body.tags : []
    const eventIdInput: string | undefined = body?.eventId ?? body?.linkToEventId

    if (!title || !title.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!eventIdInput) {
        return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const event = await prisma.event.findFirst({
        where: { OR: [{ id: eventIdInput }, { slug: eventIdInput }] },
        select: { id: true },
    })
    if (!event) {
        return NextResponse.json({ error: 'eventId not found' }, { status: 400 })
    }

    const pitch = await prisma.pitch.create({
        data: {
            title: title.trim(),
            pitchText,
            tags,
            createdBy: userId ?? null,
            eventId: event.id,
        },
    })

    return NextResponse.json(pitch, { status: 201 })
}
