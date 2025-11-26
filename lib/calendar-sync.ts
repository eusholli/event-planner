import { createEvent, EventAttributes } from 'ics'

export interface Meeting {
    id: string
    title: string
    purpose?: string | null
    startTime: Date
    endTime: Date
    sequence: number
    room?: { name: string } | null
    attendees: { name: string, email: string }[]
}

export async function sendCalendarInvites(meeting: Meeting, method: 'REQUEST' | 'CANCEL' = 'REQUEST') {
    const start = new Date(meeting.startTime)
    const end = new Date(meeting.endTime)

    const event: EventAttributes = {
        start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
        end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
        title: meeting.title,
        description: meeting.purpose || '',
        location: meeting.room?.name || 'TBD',
        uid: meeting.id, // Critical for updates
        sequence: meeting.sequence, // Critical for versioning
        status: method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED',
        organizer: { name: 'Event Planner', email: 'noreply@eventplanner.com' },
        attendees: meeting.attendees.map(a => ({ name: a.name, email: a.email, rsvp: true, partstat: 'NEEDS-ACTION', role: 'REQ-PARTICIPANT' })),
        method: method
    }

    return new Promise((resolve, reject) => {
        createEvent(event, (error, value) => {
            if (error) {
                console.error('Failed to generate ICS:', error)
                reject(error)
                return
            }

            // Mock Email Sending
            console.log('---------------------------------------------------')
            console.log(`[Mock Email Service] Sending ${method} for "${meeting.title}"`)
            console.log(`To: ${meeting.attendees.map(a => a.email).join(', ')}`)
            console.log(`Subject: ${method === 'CANCEL' ? 'Canceled: ' : 'Invitation: '} ${meeting.title}`)
            console.log('Attachment: invite.ics')
            console.log('---------------------------------------------------')
            console.log(value) // Log the raw ICS content for debugging
            console.log('---------------------------------------------------')

            resolve(value)
        })
    })
}
