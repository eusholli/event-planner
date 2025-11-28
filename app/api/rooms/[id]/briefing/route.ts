import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const room = await prisma.room.findUnique({
            where: { id },
            include: {
                meetings: {
                    include: {
                        room: true,
                        attendees: true,
                    },
                    orderBy: {
                        startTime: 'asc',
                    },
                },
            },
        })

        if (!room) {
            return NextResponse.json({ error: 'Room not found' }, { status: 404 })
        }

        return NextResponse.json(room)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch briefing data' }, { status: 500 })
    }
}
