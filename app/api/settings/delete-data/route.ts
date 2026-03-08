import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

const deleteHandler = withAuth(async () => {
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
}, { requireRole: 'root' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DELETE = deleteHandler as any
