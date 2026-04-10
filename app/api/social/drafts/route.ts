import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const rawEventId = searchParams.get('eventId')

        if (!rawEventId) {
            return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
        }

        const event = await prisma.event.findFirst({
            where: { OR: [{ id: rawEventId }, { slug: rawEventId }] },
            select: { id: true },
        })
        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const drafts = await prisma.linkedInDraft.findMany({
            where: { eventId: event.id },
            orderBy: { createdAt: 'desc' },
        })

        return NextResponse.json(drafts)
    } catch (error) {
        console.error('Error fetching LinkedIn drafts:', error)
        return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId || !await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { eventId: rawEventId, companyIds, companyNames, content, originalContent, angle, tone, articleType } = await request.json()

        if (!rawEventId || !content || !angle || !tone) {
            return NextResponse.json({ error: 'eventId, content, angle, and tone are required' }, { status: 400 })
        }

        const event = await prisma.event.findFirst({
            where: { OR: [{ id: rawEventId }, { slug: rawEventId }] },
            select: { id: true },
        })
        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const draft = await prisma.linkedInDraft.create({
            data: {
                eventId: event.id,
                companyIds: companyIds ?? [],
                companyNames: companyNames ?? [],
                content,
                originalContent: originalContent ?? null,
                angle,
                tone,
                articleType: articleType ?? null,
                createdBy: userId,
            },
        })

        return NextResponse.json(draft, { status: 201 })
    } catch (error) {
        console.error('Error saving LinkedIn draft:', error)
        return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
    }
}
