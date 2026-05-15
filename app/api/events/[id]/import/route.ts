import { NextResponse } from 'next/server'
import { importEventData } from '@/lib/actions/event'
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

        const json = await request.json()

        const result = await importEventData(id, json)

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Import failed:', error)
        return NextResponse.json({ error: error.message || 'Failed to import' }, { status: 500 })
    }
}, { requireRole: 'write', requireEventAccess: true })

export const POST = POSTHandler as any
