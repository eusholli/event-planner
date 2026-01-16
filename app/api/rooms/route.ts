import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const eventId = searchParams.get('eventId')

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
        }

        const rooms = await prisma.room.findMany({
            where: { eventId },
            orderBy: {
                name: 'asc',
            },
        })
        return NextResponse.json(rooms)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { canWrite } = await import('@/lib/roles')
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const body = await request.json()

        if (!body.eventId) {
            return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
        }

        const room = await prisma.room.create({
            data: {
                name: body.name,
                capacity: parseInt(body.capacity),
                eventId: body.eventId
            },
        })
        return NextResponse.json(room)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }
}
