import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generateInviteContent } from '@/lib/calendar-sync'

// Handle POST request for generating invite with unsaved changes
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { searchParams } = new URL(request.url)
        const onsiteName = searchParams.get('onsiteName')
        const onsitePhone = searchParams.get('onsitePhone')

        // Get the override data from request body
        const meetingOverride = await request.json()

        // Fetch room if resourceId is present but room is missing
        if (meetingOverride.resourceId && !meetingOverride.room && meetingOverride.resourceId !== 'external') {
            const room = await prisma.room.findUnique({
                where: { id: meetingOverride.resourceId }
            })
            if (room) {
                meetingOverride.room = room
            }
        }

        // Ensure we have access to settings
        const settings = await prisma.eventSettings.findFirst()
        const onsiteContact = (onsiteName || onsitePhone) ? { name: onsiteName || '', phone: onsitePhone || '' } : undefined

        // We use the override object as the source of truth
        const content = await generateInviteContent(meetingOverride as any, onsiteContact, settings?.boothLocation || undefined)

        return NextResponse.json(content)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { checkRole, Roles } = await import('@/lib/roles')
    const isRoot = await checkRole(Roles.Root)
    const isAdmin = await checkRole(Roles.Admin)

    if (!isRoot && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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

        const { searchParams } = new URL(request.url)
        const onsiteName = searchParams.get('onsiteName')
        const onsitePhone = searchParams.get('onsitePhone')

        const onsiteContact = (onsiteName || onsitePhone) ? { name: onsiteName || '', phone: onsitePhone || '' } : undefined

        const settings = await prisma.eventSettings.findFirst()

        // Generate content
        const content = await generateInviteContent(meeting as any, onsiteContact, settings?.boothLocation || undefined)

        return NextResponse.json(content)
    } catch (error: any) {
        console.error('Failed to generate invite:', error)
        return NextResponse.json({ error: 'Failed to generate invite', details: error.message }, { status: 500 })
    }
}
