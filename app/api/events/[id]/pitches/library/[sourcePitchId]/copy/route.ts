import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; sourcePitchId: string }> }) {
    const { userId } = await auth()
    if (!await canManageEvents()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: rawEventId, sourcePitchId } = await params

    const [event, source] = await Promise.all([
        prisma.event.findFirst({
            where: { OR: [{ id: rawEventId }, { slug: rawEventId }] },
            select: { id: true },
        }),
        prisma.pitch.findUnique({
            where: { id: sourcePitchId },
            select: { id: true, title: true, pitchText: true, tags: true },
        }),
    ])
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (!source) return NextResponse.json({ error: 'Source pitch not found' }, { status: 404 })

    const copy = await prisma.pitch.create({
        data: {
            title: source.title,
            pitchText: source.pitchText,
            tags: source.tags,
            createdBy: userId ?? null,
            eventId: event.id,
            sourcePitchId: source.id,
        },
    })

    return NextResponse.json(copy, { status: 201 })
}
