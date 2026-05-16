import type { MeetingStatus } from '@prisma/client'

export type BriefingStatus = MeetingStatus | 'NOT_SCHEDULED'

export interface PitchMeetingForStatus {
    id: string
    status: MeetingStatus
    date: string | null
    startTime: string | null
    attendees: { id: string }[]
}

export interface BriefingStatusResult {
    status: BriefingStatus
    meetingCount: number
    latestMeetingId: string | null
}

/**
 * Derive an attendee's briefing status from the meetings on a pitch.
 * Picks the most recent meeting (by date+startTime, with null dates last)
 * that includes the attendee, and returns its status.
 */
export function deriveBriefingStatus(
    attendeeId: string,
    pitchMeetings: PitchMeetingForStatus[]
): BriefingStatusResult {
    const matching = pitchMeetings.filter(m =>
        m.attendees.some(a => a.id === attendeeId)
    )

    if (matching.length === 0) {
        return { status: 'NOT_SCHEDULED', meetingCount: 0, latestMeetingId: null }
    }

    const sorted = [...matching].sort((a, b) => {
        const aKey = `${a.date ?? '0000-00-00'}T${a.startTime ?? '00:00'}`
        const bKey = `${b.date ?? '0000-00-00'}T${b.startTime ?? '00:00'}`
        return bKey.localeCompare(aKey)
    })

    const latest = sorted[0]
    return {
        status: latest.status,
        meetingCount: matching.length,
        latestMeetingId: latest.id,
    }
}
