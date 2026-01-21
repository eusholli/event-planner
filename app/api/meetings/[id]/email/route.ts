import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generateInviteContent } from '@/lib/calendar-sync'
import { sendEmail } from '@/lib/email'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Correct type for Next.js 15+ dynamic routes
) {
    const { checkRole, Roles } = await import('@/lib/roles')
    const isRoot = await checkRole(Roles.Root)
    const isAdmin = await checkRole(Roles.Admin)

    if (!isRoot && !isAdmin && !await checkRole(Roles.Marketing)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        const { id } = await params
        const { recipientEmail, onsiteName, onsitePhone } = await request.json()

        if (!recipientEmail) {
            return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 })
        }

        const meeting = await prisma.meeting.findUnique({
            where: { id },
            include: {
                room: true,
                attendees: true
            }
        })

        if (!meeting) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
        }

        // Generate Invite Content
        const onsiteContact = (onsiteName || onsitePhone) ? { name: onsiteName || '', phone: onsitePhone || '' } : undefined
        const content = await generateInviteContent(meeting as any, onsiteContact)

        // Send Email
        const filename = (meeting.title || 'invite').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.ics'
        await sendEmail(recipientEmail, content.subject, content.body, content.htmlBody, content.ics, filename)

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error in send email API:', error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
