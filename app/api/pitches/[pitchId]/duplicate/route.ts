import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ pitchId: string }> }) {
    const { userId } = await auth()
    if (!await canManageEvents()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { pitchId } = await params
    const body = await request.json().catch(() => ({}))
    const eventIdInput: string | undefined = body?.eventId ?? body?.linkToEventId

    if (!eventIdInput) {
        return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const [source, event] = await Promise.all([
        prisma.pitch.findUnique({
            where: { id: pitchId },
            select: { id: true, title: true, pitchText: true, tags: true },
        }),
        prisma.event.findFirst({
            where: { OR: [{ id: eventIdInput }, { slug: eventIdInput }] },
            select: { id: true },
        }),
    ])
    if (!source) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
    if (!event) return NextResponse.json({ error: 'eventId not found' }, { status: 400 })

    const copy = await prisma.pitch.create({
        data: {
            title: `${source.title} (copy)`,
            pitchText: source.pitchText,
            tags: source.tags,
            createdBy: userId ?? null,
            eventId: event.id,
            sourcePitchId: source.id,
        },
    })

    return NextResponse.json(copy, { status: 201 })
}
