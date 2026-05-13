import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ pitchId: string }> }) {
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { pitchId } = await params
        const { attendeeId, linkEventId } = await request.json()

        if (!attendeeId) {
            return NextResponse.json({ error: 'attendeeId is required' }, { status: 400 })
        }

        const pitch = await prisma.pitch.findUnique({ where: { id: pitchId }, select: { id: true } })
        if (!pitch) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })

        const attendee = await prisma.attendee.findUnique({ where: { id: attendeeId }, select: { id: true } })
        if (!attendee) return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })

        if (linkEventId) {
            const event = await prisma.event.findFirst({
                where: { OR: [{ id: linkEventId }, { slug: linkEventId }] },
                select: { id: true },
            })
            if (event) {
                await prisma.event.update({
                    where: { id: event.id },
                    data: { attendees: { connect: { id: attendeeId } } },
                })
            }
        }

        const target = await prisma.pitchAttendee.upsert({
            where: { pitchId_attendeeId: { pitchId, attendeeId } },
            create: { pitchId, attendeeId },
            update: {},
            include: {
                attendee: { include: { company: { select: { id: true, name: true } } } },
            },
        })

        return NextResponse.json(target, { status: 201 })
    } catch (error) {
        console.error('Error adding pitch target:', error)
        return NextResponse.json({ error: 'Failed to add target' }, { status: 500 })
    }
}
