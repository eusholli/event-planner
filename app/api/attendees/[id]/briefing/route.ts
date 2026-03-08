import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

async function getHandler(
    request: Request,
    { params }: { params: Promise<Record<string, string>> }
) {
    const id = (await params).id
    try {
        const attendee = await prisma.attendee.findUnique({
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

        if (!attendee) {
            return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
        }

        return NextResponse.json(attendee)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch briefing data' }, { status: 500 })
    }
}

export const GET = withAuth(getHandler, { requireAuth: true }) as any
