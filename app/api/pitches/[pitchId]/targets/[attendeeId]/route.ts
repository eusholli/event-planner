import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ pitchId: string; attendeeId: string }> }) {
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { pitchId, attendeeId } = await params
        const { resultingUrls, additionalNotes } = await request.json()

        const data: { resultingUrls?: string | null; additionalNotes?: string | null } = {}
        if (resultingUrls !== undefined) data.resultingUrls = resultingUrls
        if (additionalNotes !== undefined) data.additionalNotes = additionalNotes

        const updated = await prisma.pitchAttendee.update({
            where: { pitchId_attendeeId: { pitchId, attendeeId } },
            data,
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Error updating pitch target:', error)
        return NextResponse.json({ error: 'Failed to update target' }, { status: 500 })
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ pitchId: string; attendeeId: string }> }) {
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { pitchId, attendeeId } = await params
        await prisma.pitchAttendee.delete({
            where: { pitchId_attendeeId: { pitchId, attendeeId } },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error removing pitch target:', error)
        return NextResponse.json({ error: 'Failed to remove target' }, { status: 500 })
    }
}
