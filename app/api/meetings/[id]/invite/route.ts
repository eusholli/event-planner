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

        // Fetch Event for boothLocation
        let boothLocation: string | undefined = undefined
        const eventId = meetingOverride.eventId

        if (eventId) {
            const event = await prisma.event.findUnique({
                where: { id: eventId },
                select: { boothLocation: true }
            })
            boothLocation = event?.boothLocation || undefined
        } else {
            // Fallback: try to fetch meeting from DB to get eventId
            const id = (await params).id
            const existing = await prisma.meeting.findUnique({
                where: { id },
                select: { eventId: true }
            })
            if (existing?.eventId) {
                const event = await prisma.event.findUnique({
                    where: { id: existing.eventId },
                    select: { boothLocation: true }
                })
                boothLocation = event?.boothLocation || undefined
            }
        }

        const onsiteContact = (onsiteName || onsitePhone) ? { name: onsiteName || '', phone: onsitePhone || '' } : undefined

        // We use the override object as the source of truth
        const content = await generateInviteContent(meetingOverride as any, onsiteContact, boothLocation)

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

    if (!isRoot && !isAdmin && !await checkRole(Roles.Marketing)) {
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

        let boothLocation: string | undefined = undefined
        if (meeting.eventId) {
            const event = await prisma.event.findUnique({
                where: { id: meeting.eventId },
                select: { boothLocation: true }
            })
            boothLocation = event?.boothLocation || undefined
        }

        // Generate content
        const content = await generateInviteContent(meeting as any, onsiteContact, boothLocation)

        return NextResponse.json(content)
    } catch (error: any) {
        console.error('Failed to generate invite:', error)
        return NextResponse.json({ error: 'Failed to generate invite', details: error.message }, { status: 500 })
    }
}
