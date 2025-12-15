import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generateInviteContent } from '@/lib/calendar-sync'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const meeting = await prisma.meeting.findUnique({
            where: { id },
            include: {
                room: true,
                attendees: true,
            }
        })

        if (!meeting) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
        }

        // Validate "Ready" state
        if (!meeting.date || !meeting.startTime || !meeting.endTime) {
            return NextResponse.json({ error: 'Meeting is missing date or time' }, { status: 400 })
        }

        // Generate content
        // We cast to any because our Prisma type doesn't perfectly match the strict Meeting interface in calendar-sync 
        // (dates are strings in DB but interface expects
        const { searchParams } = new URL(request.url)
        const onsiteName = searchParams.get('onsiteName')
        const onsitePhone = searchParams.get('onsitePhone')
        // Generate Invite Content
        const onsiteContact = (onsiteName || onsitePhone) ? { name: onsiteName || '', phone: onsitePhone || '' } : undefined

        // Generate content
        const content = await generateInviteContent(meeting as any, onsiteContact)

        return NextResponse.json(content)
    } catch (error: any) {
        console.error('Failed to generate invite:', error)
        return NextResponse.json({ error: 'Failed to generate invite', details: error.message }, { status: 500 })
    }
}
