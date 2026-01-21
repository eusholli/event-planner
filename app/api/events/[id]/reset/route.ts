import { NextResponse } from 'next/server'
import { resetEventData } from '@/lib/actions/event'
import { canWrite } from '@/lib/roles'
import { resolveEventId } from '@/lib/events'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const rawId = (await params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        // LOCK CHECK
        const { isEventEditable } = await import('@/lib/events')
        if (!await isEventEditable(id)) {
            return NextResponse.json({
                error: 'Event has occurred and is read-only.'
            }, { status: 403 })
        }

        await resetEventData(id)

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Reset failed:', error)
        return NextResponse.json({ error: error.message || 'Failed to reset event' }, { status: 500 })
    }
}
