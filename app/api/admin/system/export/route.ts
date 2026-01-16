import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isRootUser } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        if (!await isRootUser()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const events = await prisma.event.findMany({
            include: {
                attendees: { include: { meetings: true } },
                rooms: true,
                meetings: { include: { attendees: true, room: true } }
            }
        })

        const settings = await prisma.systemSettings.findFirst()

        const exportData = {
            systemSettings: settings,
            events: events,
            exportedAt: new Date().toISOString(),
            version: '2.0-full-system'
        }

        return NextResponse.json(exportData)
    } catch (error) {
        console.error('System export error:', error)
        return NextResponse.json({ error: 'Failed to export system' }, { status: 500 })
    }
}
