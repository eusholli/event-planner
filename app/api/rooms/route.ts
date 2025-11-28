import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'


export async function GET() {
    try {
        const rooms = await prisma.room.findMany()
        return NextResponse.json(rooms)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const room = await prisma.room.create({
            data: {
                name: body.name,
                capacity: parseInt(body.capacity),
            },
        })
        return NextResponse.json(room)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }
}
