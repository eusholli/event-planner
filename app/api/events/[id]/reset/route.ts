import { NextResponse } from 'next/server'
import { resetEventData } from '@/lib/actions/event'
import { withAuth } from '@/lib/with-auth'
import { resolveEventId } from '@/lib/events'

export const dynamic = 'force-dynamic'

const POSTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
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
}, { requireRole: 'write', requireEventAccess: true })

export const POST = POSTHandler as any
