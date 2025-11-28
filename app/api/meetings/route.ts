import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'



export async function GET() {
    try {
        const meetings = await prisma.meeting.findMany({
            include: {
                room: true,
                attendees: true,
            },
        })
        return NextResponse.json(meetings)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            title,
            purpose,
            date,
            startTime,
            endTime,
            roomId,
            attendeeIds,
            status = 'STARTED',
            tags,
            requesterEmail,
            meetingType,
            otherDetails,
            isApproved,
            calendarInviteSent
        } = body

        let createdBy = null
        if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
            createdBy = 'test-user@example.com'
        } else {
            const user = await currentUser()
            createdBy = user?.emailAddresses[0]?.emailAddress
        }

        // Basic title validation for all meetings
        if (!title || title.trim() === '') {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 })
        }

        // Validate COMPLETED status requirements
        if (status === 'COMPLETED') {
            if (!date || !startTime || !endTime) {
                return NextResponse.json({ error: 'Date, Start time, and End time are required for completed meetings' }, { status: 400 })
            }
            if (!roomId) {
                return NextResponse.json({ error: 'Room is required for completed meetings' }, { status: 400 })
            }
            if (!attendeeIds || attendeeIds.length === 0) {
                return NextResponse.json({ error: 'At least one attendee is required for completed meetings' }, { status: 400 })
            }
        }

        // Validate times if provided
        let start, end
        if (date && startTime && endTime) {
            start = new Date(`${date}T${startTime}`)
            end = new Date(`${date}T${endTime}`)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })
            }

            if (start >= end) {
                return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
            }
        }

        // 1. Check Room Availability (only if room, date, and times are provided)
        if (roomId && date && startTime && endTime) {
            // We need to check for overlaps. Since we store strings, we can compare them if date is same.
            // But to be safe and handle potential cross-day events (though we only have one date field now),
            // let's assume single-day events for now as implied by the schema.
            // Actually, string comparison "HH:mm" works for time ranges on the same day.

            const roomConflicts = await prisma.meeting.findMany({
                where: {
                    roomId,
                    date: date,
                    OR: [
                        { startTime: { lt: endTime }, endTime: { gt: startTime } },
                    ],
                },
            })

            if (roomConflicts.length > 0) {
                return NextResponse.json({ error: 'Room is already booked for this time slot' }, { status: 409 })
            }
        }

        // 2. Check Attendee Availability (only if attendees, date, and times are provided)
        if (attendeeIds && attendeeIds.length > 0 && date && startTime && endTime) {
            const attendeeConflicts = await prisma.meeting.findMany({
                where: {
                    attendees: {
                        some: {
                            id: { in: attendeeIds },
                        },
                    },
                    date: date,
                    OR: [
                        { startTime: { lt: endTime }, endTime: { gt: startTime } },
                    ],
                },
                include: {
                    attendees: true,
                }
            })

            if (attendeeConflicts.length > 0) {
                // Find which attendees are conflicted
                const conflictedAttendeeNames = new Set<string>()
                attendeeConflicts.forEach((m: any) => {
                    m.attendees.forEach((a: any) => {
                        if (attendeeIds.includes(a.id)) {
                            conflictedAttendeeNames.add(a.name)
                        }
                    })
                })

                return NextResponse.json({
                    error: `The following attendees are busy: ${Array.from(conflictedAttendeeNames).join(', ')}`
                }, { status: 409 })
            }
        }

        // Prepare data for creation
        const meetingData: any = {
            title,
            purpose,
            status,
            tags,
            date,
            startTime,
            endTime,
            createdBy,
            requesterEmail,
            meetingType,
            otherDetails,
            isApproved,
            calendarInviteSent
        }

        // Only add room if provided
        if (roomId) {
            meetingData.roomId = roomId
        }

        // Only add attendees if provided
        if (attendeeIds && attendeeIds.length > 0) {
            meetingData.attendees = {
                connect: attendeeIds.map((id: string) => ({ id })),
            }
        }

        const meeting = await prisma.meeting.create({
            data: meetingData,
            include: {
                room: true,
                attendees: true,
            }
        })

        // Send Calendar Invites
        try {
            if (meeting.date && meeting.startTime && meeting.endTime) {
                const { sendCalendarInvites } = await import('@/lib/calendar-sync')
                await sendCalendarInvites(meeting as any)
            }
        } catch (error) {
            console.error('Failed to send calendar invites:', error)
        }

        return NextResponse.json(meeting)
    } catch (error: any) {
        console.error('Create meeting error:', error)
        return NextResponse.json({ error: 'Failed to create meeting', details: error.message }, { status: 500 })
    }
}
