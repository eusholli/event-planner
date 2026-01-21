import { NextResponse } from 'next/server'
import { importEventData } from '@/lib/actions/event'
import { canWrite } from '@/lib/roles'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const id = (await params).id

        // LOCK CHECK
        const { isEventEditable } = await import('@/lib/events')
        if (!await isEventEditable(id)) {
            return NextResponse.json({
                error: 'Event has occurred and is read-only.'
            }, { status: 403 })
        }

        const json = await request.json()

        const result = await importEventData(id, json)

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Import failed:', error)
        return NextResponse.json({ error: error.message || 'Failed to import' }, { status: 500 })
    }
}
