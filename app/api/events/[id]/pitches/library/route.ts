import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set(['title', 'modified', 'createdAt'] as const)
type SortBy = 'title' | 'modified' | 'createdAt'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!await canManageEvents()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: rawEventId } = await params
    const event = await prisma.event.findFirst({
        where: { OR: [{ id: rawEventId }, { slug: rawEventId }] },
        select: { id: true },
    })
    if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim()
    const sortByRaw = searchParams.get('sortBy') ?? 'modified'
    const sortBy: SortBy = (SORTABLE.has(sortByRaw as SortBy) ? sortByRaw : 'modified') as SortBy
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))

    const where: Prisma.PitchWhereInput = {
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    }

    const [items, total] = await Promise.all([
        prisma.pitch.findMany({
            where,
            orderBy: { [sortBy]: sortDir },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                event: { select: { id: true, name: true, slug: true } },
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
        sourceEvent: p.event,
    }))

    return NextResponse.json({ items: result, total, page, limit })
}
