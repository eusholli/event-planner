import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const pitchAttendees = await prisma.pitchAttendee.findMany({
        where: { pitch: { eventId: event.id } },
        select: {
            pitchId: true,
            attendeeId: true,
            resultingUrls: true,
            attendee: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    title: true,
                    isExternal: true,
                    company: { select: { id: true, name: true } },
                },
            },
        },
    })

    const pitchIds = Array.from(new Set(pitchAttendees.map(p => p.pitchId)))

    const meetings = pitchIds.length
        ? await prisma.meeting.findMany({
            where: {
                pitchId: { in: pitchIds },
                status: { in: ['PIPELINE', 'CONFIRMED', 'OCCURRED'] },
            },
            select: {
                pitchId: true,
                status: true,
                attendees: { select: { id: true } },
            },
        })
        : []

    // (pitchId, attendeeId) -> per-status counts
    const pairCounts = new Map<string, { PIPELINE: number; CONFIRMED: number; OCCURRED: number }>()
    const pairKey = (pid: string, aid: string) => `${pid}::${aid}`

    // Initialize zeroes for every target pair so empty maps still return rows.
    for (const pa of pitchAttendees) {
        pairCounts.set(pairKey(pa.pitchId, pa.attendeeId), { PIPELINE: 0, CONFIRMED: 0, OCCURRED: 0 })
    }
    for (const m of meetings) {
        if (!m.pitchId) continue
        for (const a of m.attendees) {
            const key = pairKey(m.pitchId, a.id)
            const bucket = pairCounts.get(key)
            if (!bucket) continue
            bucket[m.status as 'PIPELINE' | 'CONFIRMED' | 'OCCURRED'] += 1
        }
    }

    type Row = {
        attendee: { id: string; name: string; email: string; title: string | null; isExternal: boolean; company: { id: string; name: string } | null }
        pipelineCount: number
        committedCount: number
        occurredCount: number
        urls: string[]
        pitchCount: number
    }
    const byAttendee = new Map<string, Row>()
    const pitchesSeen = new Map<string, Set<string>>()

    for (const pa of pitchAttendees) {
        const a = pa.attendee
        let row = byAttendee.get(a.id)
        if (!row) {
            row = {
                attendee: {
                    id: a.id,
                    name: a.name,
                    email: a.email,
                    title: a.title ?? null,
                    isExternal: a.isExternal ?? false,
                    company: a.company,
                },
                pipelineCount: 0,
                committedCount: 0,
                occurredCount: 0,
                urls: [],
                pitchCount: 0,
            }
            byAttendee.set(a.id, row)
            pitchesSeen.set(a.id, new Set())
        }

        const counts = pairCounts.get(pairKey(pa.pitchId, pa.attendeeId))
        if (counts) {
            row.pipelineCount += counts.PIPELINE
            row.committedCount += counts.CONFIRMED
            row.occurredCount += counts.OCCURRED
        }

        if (pa.resultingUrls) {
            for (const raw of pa.resultingUrls.split(',')) {
                const u = raw.trim()
                if (u && !row.urls.includes(u)) row.urls.push(u)
            }
        }

        const seen = pitchesSeen.get(a.id)!
        if (!seen.has(pa.pitchId)) {
            seen.add(pa.pitchId)
            row.pitchCount += 1
        }
    }

    const items = Array.from(byAttendee.values()).sort((a, b) =>
        a.attendee.name.localeCompare(b.attendee.name)
    )

    return NextResponse.json({ items })
}
