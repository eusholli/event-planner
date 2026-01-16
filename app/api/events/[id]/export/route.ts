import { NextResponse } from 'next/server'
import { exportEventData } from '@/lib/actions/event'
import { canWrite } from '@/lib/roles'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const resolvedParams = await params
        const data = await exportEventData(resolvedParams.id)

        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `event-${resolvedParams.id}-${date}.json`

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
