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
        const { recipientEmail, recipientEmails, onsiteName, onsitePhone, customBody, customSubject } = await request.json()

        // handle backward comaptibility or new format
        const emailsToProcess: string[] = []
        if (recipientEmails && Array.isArray(recipientEmails)) {
            emailsToProcess.push(...recipientEmails)
        } else if (recipientEmail) {
            emailsToProcess.push(recipientEmail)
        }

        if (emailsToProcess.length === 0) {
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
        // Fetch Event for boothLocation
        let boothLocation: string | undefined = undefined
        if (meeting.eventId) {
            const event = await prisma.event.findUnique({
                where: { id: meeting.eventId },
                select: { boothLocation: true }
            })
            boothLocation = event?.boothLocation || undefined
        }

        const onsiteContact = (onsiteName || onsitePhone) ? { name: onsiteName || '', phone: onsitePhone || '' } : undefined
        const content = await generateInviteContent(meeting as any, onsiteContact, boothLocation)

        // Use custom body if provided, otherwise default to generated body
        const finalBody = customBody || content.body;
        // If custom body is used, wrap it for HTML, otherwise use generated HTML
        // Outlook requires explicit <br> tags instead of just white-space: pre-wrap
        const finalHtml = customBody
            ? `<div style="font-family: sans-serif;">${customBody.replace(/\r?\n/g, '<br>')}</div>`
            : content.htmlBody;

        // Send Email
        const filename = (meeting.title || 'invite').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.ics'
        const toAddress = emailsToProcess.join(', ')

        // Use custom subject if provided, otherwise default to generated subject
        const finalSubject = customSubject || content.subject;

        await sendEmail(toAddress, finalSubject, finalBody, finalHtml, content.ics, filename)

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error in send email API:', error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
