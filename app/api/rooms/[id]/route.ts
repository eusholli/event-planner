import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const body = await request.json()
        const { name, capacity } = body

        const room = await prisma.room.update({
            where: { id },
            data: {
                name,
                capacity: parseInt(capacity),
            },
        })

        return NextResponse.json(room)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update room' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        await prisma.room.delete({
            where: { id },
        })
        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 })
    }
}
