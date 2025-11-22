export async function syncToOutlook(meeting: any, attendees: any[]) {
    console.log(`[Mock Outlook] Syncing meeting "${meeting.title}" to Outlook...`)

    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 500))

    // Simulate success
    attendees.forEach(attendee => {
        console.log(`[Mock Outlook] Sent invite to ${attendee.email}`)
    })

    return { success: true, message: 'Synced to Outlook' }
}
