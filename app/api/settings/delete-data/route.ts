import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function DELETE() {
    try {
        // Delete in order of dependencies
        await prisma.meeting.deleteMany()
        await prisma.attendee.deleteMany()
        await prisma.room.deleteMany()

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete error:', error)
        return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 })
    }
}
