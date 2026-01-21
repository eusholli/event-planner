import { NextResponse } from 'next/server'
import { exportEventData } from '@/lib/actions/event'
import { canWrite } from '@/lib/roles'
import { resolveEventId } from '@/lib/events'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const resolvedParams = await params
        const id = await resolveEventId(resolvedParams.id)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const data = await exportEventData(id)

        const now = new Date()
        const dateStr = now.toISOString().replace(/T/, '-').replace(/\..+/, '').replace(/:/g, '-')
        const sanitizedName = data.event.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        const filename = `${sanitizedName}-${dateStr}.json`

        return new NextResponse(JSON.stringify(data, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })
    } catch (error: any) {
        console.error('Export failed:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to export event' },
            { status: 500 }
        )
    }
}
