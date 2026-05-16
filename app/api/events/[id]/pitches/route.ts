import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set([
    'title',
    'modified',
    'createdAt',
    'targetsCount',
    'pipelineCount',
    'committedCount',
    'occurredCount',
] as const)
type SortBy =
    | 'title'
    | 'modified'
    | 'createdAt'
    | 'targetsCount'
    | 'pipelineCount'
    | 'committedCount'
    | 'occurredCount'

type StatusKey = 'pipelineCount' | 'committedCount' | 'occurredCount'
const DERIVED: ReadonlySet<StatusKey> = new Set(['pipelineCount', 'committedCount', 'occurredCount'])

async function computeStatusCounts(pitchIds: string[]) {
    const empty = () => ({
        pipelineCount: 0,
        committedCount: 0,
        occurredCount: 0,
    })
    const out = new Map<string, ReturnType<typeof empty>>()
    for (const id of pitchIds) out.set(id, empty())
    if (pitchIds.length === 0) return out

    const [meetings, targets] = await Promise.all([
        prisma.meeting.findMany({
            where: {
                pitchId: { in: pitchIds },
                status: { in: ['PIPELINE', 'CONFIRMED', 'OCCURRED'] },
            },
            select: {
                pitchId: true,
                status: true,
                attendees: { select: { id: true } },
            },
        }),
        prisma.pitchAttendee.findMany({
            where: { pitchId: { in: pitchIds } },
            select: { pitchId: true, attendeeId: true },
        }),
    ])

    const targetsByPitch = new Map<string, Set<string>>()
    for (const t of targets) {
        if (!t.pitchId) continue
        let set = targetsByPitch.get(t.pitchId)
        if (!set) { set = new Set(); targetsByPitch.set(t.pitchId, set) }
        set.add(t.attendeeId)
    }

    const distinctPerStatus = new Map<string, { PIPELINE: Set<string>; CONFIRMED: Set<string>; OCCURRED: Set<string> }>()
    for (const id of pitchIds) {
        distinctPerStatus.set(id, { PIPELINE: new Set(), CONFIRMED: new Set(), OCCURRED: new Set() })
    }
    for (const m of meetings) {
        if (!m.pitchId) continue
        const validTargets = targetsByPitch.get(m.pitchId)
        if (!validTargets || validTargets.size === 0) continue
        const buckets = distinctPerStatus.get(m.pitchId)
        if (!buckets) continue
        const bucket = buckets[m.status as 'PIPELINE' | 'CONFIRMED' | 'OCCURRED']
        for (const a of m.attendees) {
            if (validTargets.has(a.id)) bucket.add(a.id)
        }
    }

    for (const [id, buckets] of distinctPerStatus) {
        out.set(id, {
            pipelineCount: buckets.PIPELINE.size,
            committedCount: buckets.CONFIRMED.size,
            occurredCount: buckets.OCCURRED.size,
        })
    }
    return out
}

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
        eventId: event.id,
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    }

    const total = await prisma.pitch.count({ where })

    if (DERIVED.has(sortBy as StatusKey)) {
        const allIds = (await prisma.pitch.findMany({
            where,
            select: { id: true },
        })).map(p => p.id)

        const counts = await computeStatusCounts(allIds)
        const key = sortBy as StatusKey
        const sortedIds = [...allIds].sort((a, b) => {
            const av = counts.get(a)?.[key] ?? 0
            const bv = counts.get(b)?.[key] ?? 0
            if (av === bv) return a.localeCompare(b)
            return sortDir === 'asc' ? av - bv : bv - av
        })
        const pageIds = sortedIds.slice((page - 1) * limit, (page - 1) * limit + limit)

        const rows = await prisma.pitch.findMany({
            where: { id: { in: pageIds } },
            include: { _count: { select: { targets: true, meetings: true } } },
        })
        const byId = new Map(rows.map(r => [r.id, r]))
        const result = pageIds.map(id => {
            const p = byId.get(id)!
            const c = counts.get(id) ?? { pipelineCount: 0, committedCount: 0, occurredCount: 0 }
            return {
                id: p.id,
                title: p.title,
                pitchText: p.pitchText,
                tags: p.tags,
                createdAt: p.createdAt,
                modified: p.modified,
                targetsCount: p._count.targets,
                meetingsCount: p._count.meetings,
                pipelineCount: c.pipelineCount,
                committedCount: c.committedCount,
                occurredCount: c.occurredCount,
            }
        })
        return NextResponse.json({ items: result, total, page, limit })
    }

    const orderBy: Prisma.PitchOrderByWithRelationInput =
        sortBy === 'targetsCount'
            ? { targets: { _count: sortDir } }
            : { [sortBy]: sortDir }

    const items = await prisma.pitch.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
            _count: { select: { targets: true, meetings: true } },
        },
    })

    const counts = await computeStatusCounts(items.map(i => i.id))

    const result = items.map(p => {
        const c = counts.get(p.id) ?? { pipelineCount: 0, committedCount: 0, occurredCount: 0 }
        return {
            id: p.id,
            title: p.title,
            pitchText: p.pitchText,
            tags: p.tags,
            createdAt: p.createdAt,
            modified: p.modified,
            targetsCount: p._count.targets,
            meetingsCount: p._count.meetings,
            pipelineCount: c.pipelineCount,
            committedCount: c.committedCount,
            occurredCount: c.occurredCount,
        }
    })

    return NextResponse.json({ items: result, total, page, limit })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId } = await auth()
    if (!await canManageEvents()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: rawEventId } = await params
    const { title, pitchText, tags } = await request.json()

    if (!title || !title.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const event = await prisma.event.findFirst({
        where: { OR: [{ id: rawEventId }, { slug: rawEventId }] },
        select: { id: true },
    })
    if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const pitch = await prisma.pitch.create({
        data: {
            title: title.trim(),
            pitchText: pitchText ?? '',
            tags: Array.isArray(tags) ? tags : [],
            createdBy: userId ?? null,
            eventId: event.id,
        },
    })

    return NextResponse.json(pitch, { status: 201 })
}
