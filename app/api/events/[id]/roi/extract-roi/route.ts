import { NextResponse } from 'next/server'
import { resolveEventId } from '@/lib/events'
import { extractROIValues } from '@/lib/actions/roi-generate'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

const POSTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const draft = await extractROIValues(id)
        return NextResponse.json(draft)

    } catch (error: unknown) {
        console.error('Error extracting ROI values:', error)
        const msg = error instanceof Error ? error.message : 'Failed to extract ROI values'
        const status = msg.includes('No marketing plan') ? 400
            : msg.includes('not configured') ? 400
                : 500
        return NextResponse.json({ error: msg }, { status })
    }
}, { requireRole: 'write', requireEventAccess: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = POSTHandler as any
