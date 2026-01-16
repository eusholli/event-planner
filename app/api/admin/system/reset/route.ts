import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isRootUser } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        if (!await isRootUser()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Transactional delete of all data
        // Order matters for relational integrity if cascades aren't perfect, but Prisma usually handles it.
        // We delete EVENTS, which should cascade to everything else (Attendees, Rooms, Meetings) because of relation onDelete: Cascade.
        // If not cascade, we must delete children first.
        // Let's assume Prisma Schema has Cascade.

        // Actually, let's delete explicitly to be safe and thorough.

        await prisma.$transaction([
            prisma.meeting.deleteMany(),
            prisma.attendee.deleteMany(),
            prisma.room.deleteMany(),
            prisma.event.deleteMany(),
            // We KEEP SystemSettings (API Keys) so we don't lock ourselves out of AI? 
            // Factory usually means "Data Reset".
        ])

        return NextResponse.json({ success: true, message: 'System data reset successfully' })
    } catch (error) {
        console.error('System reset error:', error)
        return NextResponse.json({ error: 'Failed to reset system' }, { status: 500 })
    }
}
