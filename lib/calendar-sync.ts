import { createEvent, EventAttributes } from 'ics'



export interface Meeting {
    id: string
    title: string
    purpose?: string | null
    date?: string | null
    startTime?: string | null
    endTime?: string | null
    sequence: number
    room?: { name: string } | null
    location?: string | null
    attendees: { name: string, email: string, title?: string | null, company?: string | null }[]
    requesterEmail?: string | null
    otherDetails?: string | null
    createdBy?: string | null
}

interface OnsiteContact {
    name: string
    phone: string
}

export async function generateInviteContent(meeting: Meeting, onsiteContact?: OnsiteContact, boothLocation?: string) {
    if (!meeting.date || !meeting.startTime || !meeting.endTime) {
        throw new Error('Missing date or time')
    }

    const start = new Date(`${meeting.date}T${meeting.startTime}`)
    const end = new Date(`${meeting.date}T${meeting.endTime}`)

    const organizerEmail = meeting.requesterEmail || meeting.createdBy || 'udai.kanukolanu@rakuten.com'
    const organizerName = 'Event Planner' // Or derive from email if needed

    // Location Logic
    // Location Logic
    const specificLocation = meeting.location || meeting.room?.name || 'TBD';
    const locationString = boothLocation
        ? `${boothLocation} - ${specificLocation}`
        : specificLocation;

    // 1. Generate ICS
    const event: EventAttributes = {
        start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
        end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
        title: meeting.title,
        description: meeting.purpose || '',
        location: locationString,
        uid: meeting.id,
        sequence: meeting.sequence,
        status: 'CONFIRMED',
        organizer: { name: organizerName, email: organizerEmail },
        attendees: meeting.attendees.map(a => ({ name: a.name, email: a.email, rsvp: true, partstat: 'NEEDS-ACTION', role: 'REQ-PARTICIPANT' })),
        method: 'REQUEST'
    }

    const icsContent = await new Promise<string>((resolve, reject) => {
        createEvent(event, (error, value) => {
            if (error) reject(error)
            else resolve(value)
        })
    })

    // 2. Generate Email Subject
    // Format: [10:00AM] Iridium x Rakuten Symphony - Meeting Room 2 (Sharad)
    const timeString = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '')
    const subject = `[${timeString}] ${meeting.title}`

    // 3. Generate Email Body (Text & HTML)
    // Meeting Date / Time: Monday, March 2, 2026 at 10:00 AM - 10:30 AM
    const dateString = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const startTimeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const endTimeStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const meetingDateTime = `${dateString} at ${startTimeStr} - ${endTimeStr}`

    // Group Attendees
    const rakutenAttendees: string[] = []
    const otherAttendees: { company: string, details: string }[] = []

    meeting.attendees.forEach(a => {
        const detail = a.title ? `${a.name}, ${a.title}` : a.name
        if (a.company?.toLowerCase().includes('rakuten')) {
            rakutenAttendees.push(detail)
        } else {
            const company = a.company || 'Other'
            otherAttendees.push({ company, details: detail })
        }
    })

    // Helper to format groups
    const formatGroup = (title: string, items: string[]) => {
        if (items.length === 0) return ''
        return `${title}\n${items.join('\n')}\n`
    }

    // Group "Other" attendees by company
    const otherGroups: Record<string, string[]> = {}
    otherAttendees.forEach(a => {
        if (!otherGroups[a.company]) otherGroups[a.company] = []
        otherGroups[a.company].push(a.details)
    })

    let attendeesText = ''
    let attendeesHtml = ''

    // Process non-Rakuten groups first (usually customers/partners) or just append all
    // Request implies strict ordering: "Iridium Attendees" then "Rakuten Symphony Attendees"
    // We will list all non-Rakuten companies first, then Rakuten

    for (const [company, details] of Object.entries(otherGroups)) {
        attendeesText += formatGroup(`${company} Attendees:`, details) + '\n'
        attendeesHtml += `<p><b>${company} Attendees</b><br>${details.join('<br>')}</p><br>`
    }

    if (rakutenAttendees.length > 0) {
        attendeesText += formatGroup('Rakuten Symphony Attendees', rakutenAttendees)
        attendeesHtml += `<p><b>Rakuten Symphony Attendees</b><br>${rakutenAttendees.join('<br>')}</p><br>`
    }

    let onsiteLine = ''
    if (onsiteContact) {
        const parts = []
        if (onsiteContact.name) parts.push(`Onsite Contact: ${onsiteContact.name}`)
        if (onsiteContact.phone) parts.push(`(call / text: ${onsiteContact.phone})`)
        onsiteLine = parts.join(' ')
    }

    const body = `Subject: ${subject}
Location: ${locationString}
Organizer: ${organizerEmail}
Meeting Date / Time: ${meetingDateTime}

${attendeesText}
${meeting.purpose ? `Purpose: ${meeting.purpose}\n` : ''}
${meeting.otherDetails ? `Other Details: ${meeting.otherDetails}\n` : ''}

${onsiteLine}

---------------------------------------------------
Ref: ${meeting.id}`

    const htmlBody = `
    <div style="font-family: sans-serif;">
    <p><b>Subject:</b> ${subject}</p>
    <p><b>Location:</b> ${locationString}</p>
    <p><b>Organizer:</b> ${organizerEmail}</p>
    <p><b>Meeting Date / Time:</b> ${meetingDateTime}</p>
    <br>
    ${attendeesHtml}
    ${meeting.purpose ? `<p><b>Purpose:</b><br>${meeting.purpose.replace(/\n/g, '<br>')}</p><br>` : ''}
    ${meeting.otherDetails ? `<p><b>Other Details:</b><br>${meeting.otherDetails.replace(/\n/g, '<br>')}</p><br>` : ''}
    <p><b>${onsiteLine}</b></p>
    <br>
    <hr>
    <p style="font-size: 10px; color: #666;">Ref: ${meeting.id}</p>
    </div>
    `

    const finalBody = body.replace(/\n{3,}/g, '\n\n')
    const finalHtmlBody = htmlBody.replace(/(<br>\s*){3,}/g, '<br><br>').trim()

    return { subject, body: finalBody, htmlBody: finalHtmlBody, ics: icsContent }
}

// Keep the old function for backward compatibility if needed, using the new core logic
export async function sendCalendarInvites(meeting: Meeting, method: 'REQUEST' | 'CANCEL' = 'REQUEST') {
    try {
        const content = await generateInviteContent(meeting)

        // Mock Email Sending
        console.log('---------------------------------------------------')
        console.log(`[Mock Email Service] Sending ${method} for "${meeting.title}"`)
        console.log(`Subject: ${content.subject}`)
        console.log('Attachment: invite.ics')
        console.log('---------------------------------------------------')
        console.log(content.ics)
        console.log('---------------------------------------------------')

        return content.ics
    } catch (error) {
        console.error('Failed to generate invite:', error)
        throw error
    }
}
