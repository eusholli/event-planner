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
    attendees: { name: string, email: string }[]
    requesterEmail?: string | null
}

interface OnsiteContact {
    name: string
    phone: string
}

export async function generateInviteContent(meeting: Meeting, onsiteContact?: OnsiteContact) {
    if (!meeting.date || !meeting.startTime || !meeting.endTime) {
        throw new Error('Missing date or time')
    }

    const start = new Date(`${meeting.date}T${meeting.startTime}`)
    const end = new Date(`${meeting.date}T${meeting.endTime}`)

    // 1. Generate ICS
    const event: EventAttributes = {
        start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
        end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
        title: meeting.title,
        description: meeting.purpose || '',
        location: meeting.location || meeting.room?.name || 'TBD',
        uid: meeting.id,
        sequence: meeting.sequence,
        status: 'CONFIRMED',
        organizer: { name: 'Event Planner', email: meeting.requesterEmail || 'noreply@eventplanner.com' },
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
    // Format: [9:00AM] EchoStar x Rakuten - Hall 2 Booth 2C70 (Room 1)
    const timeString = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '')
    const locationString = meeting.location || meeting.room?.name || 'TBD'
    const subject = `[${timeString}] ${meeting.title} - ${locationString}`

    // 3. Generate Email Body (Text & HTML)
    const dateString = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const startTimeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const endTimeStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    const attendeesList = meeting.attendees.map(a => a.name).join('\n')
    const attendeesListHtml = meeting.attendees.map(a => a.name).join('<br>')

    const onsiteLine = onsiteContact
        ? `Onsite Contact: ${onsiteContact.name} (call / text: ${onsiteContact.phone})`
        : 'Onsite Contact: [Name] (call / text: [Phone])'

    const body = `Subject: ${subject}
Location: ${locationString}
Organizer: ${meeting.requesterEmail || 'udai.kanukolanu@rakuten.com'}
Start time: ${dateString} at ${startTimeStr}
End time: ${dateString} at ${endTimeStr}

${meeting.title}

Meeting
Date / Time ${dateString} at ${startTimeStr}
Location
${locationString}

Attendees
${attendeesList}

${onsiteLine}

---------------------------------------------------
Ref: ${meeting.id}`

    const htmlBody = `
    <p><b>Subject:</b> ${subject}</p>
    <p><b>Location:</b> ${locationString}</p>
    <p><b>Organizer:</b> ${meeting.requesterEmail || 'udai.kanukolanu@rakuten.com'}</p>
    <p><b>Start time:</b> ${dateString} at ${startTimeStr}</p>
    <p><b>End time:</b> ${dateString} at ${endTimeStr}</p>
    <br>
    <p>${meeting.title}</p>
    <br>
    <p><b>Meeting</b></p>
    <p><b>Date / Time</b> ${dateString} at ${startTimeStr}</p>
    <p><b>Location</b><br>${locationString}</p>
    <br>
    <p><b>Attendees</b><br>${attendeesListHtml}</p>
    <br>
    <p><b>${onsiteLine}</b></p>
    <br>
    <hr>
    <p style="font-size: 10px; color: #666;">Ref: ${meeting.id}</p>
    `

    return { subject, body, htmlBody, ics: icsContent }
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
