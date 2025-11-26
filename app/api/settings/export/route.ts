import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
    try {
        const settings = await prisma.eventSettings.findFirst()
        const attendees = await prisma.attendee.findMany()
        const rooms = await prisma.room.findMany()
        const meetings = await prisma.meeting.findMany({
            include: {
                room: true,
                attendees: true
            }
        })

        const exportData = {
            event: settings ? {
                name: settings.name,
                startDate: settings.startDate.toISOString().split('T')[0], // Export as YYYY-MM-DD
                endDate: settings.endDate.toISOString().split('T')[0], // Export as YYYY-MM-DD
                geminiApiKey: settings.geminiApiKey,
                tags: settings.tags
            } : null,
            attendees: attendees.map(a => ({
                name: a.name,
                title: a.title,
                email: a.email,
                bio: a.bio,
                company: a.company,
                companyDescription: a.companyDescription,
                linkedin: a.linkedin,
                imageUrl: a.imageUrl
            })),
            rooms: rooms.map(r => ({
                name: r.name,
                capacity: r.capacity
            })),
            meetings: meetings.map(m => ({
                title: m.title,
                startTime: m.startTime,
                endTime: m.endTime,
                room: m.room?.name,
                attendees: m.attendees.map(a => a.email)
            }))
        }

        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `event-config-${date}.json`

        return new NextResponse(JSON.stringify(exportData, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })
    } catch (error) {
        console.error('Export error:', error)
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
    }
}
