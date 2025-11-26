import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

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
        const { title, purpose, startTime, endTime, roomId, attendeeIds, status = 'STARTED', tags } = body

        // Basic title validation for all meetings
        if (!title || title.trim() === '') {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 })
        }

        // Validate COMPLETED status requirements
        if (status === 'COMPLETED') {
            if (!startTime || !endTime) {
                return NextResponse.json({ error: 'Start time and end time are required for completed meetings' }, { status: 400 })
            }
            if (!roomId) {
                return NextResponse.json({ error: 'Room is required for completed meetings' }, { status: 400 })
            }
            if (!attendeeIds || attendeeIds.length === 0) {
                return NextResponse.json({ error: 'At least one attendee is required for completed meetings' }, { status: 400 })
            }
        }

        // Only validate times if they are provided
        let start, end
        if (startTime && endTime) {
            start = new Date(startTime)
            end = new Date(endTime)

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return NextResponse.json({ error: 'Invalid start or end time' }, { status: 400 })
            }

            if (start >= end) {
                return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
            }
        }

        // 1. Check Room Availability (only if room and times are provided)
        if (roomId && start && end) {
            const roomConflicts = await prisma.meeting.findMany({
                where: {
                    roomId,
                    OR: [
                        { startTime: { lt: end }, endTime: { gt: start } },
                    ],
                },
            })

            if (roomConflicts.length > 0) {
                return NextResponse.json({ error: 'Room is already booked for this time slot' }, { status: 409 })
            }
        }

        // 2. Check Attendee Availability (only if attendees and times are provided)
        if (attendeeIds && attendeeIds.length > 0 && start && end) {
            const attendeeConflicts = await prisma.meeting.findMany({
                where: {
                    attendees: {
                        some: {
                            id: { in: attendeeIds },
                        },
                    },
                    OR: [
                        { startTime: { lt: end }, endTime: { gt: start } },
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
        }

        // Only add times if provided, otherwise explicitly null
        if (start && end) {
            meetingData.startTime = start
            meetingData.endTime = end
        } else {
            meetingData.startTime = null
            meetingData.endTime = null
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
            if (meeting.startTime && meeting.endTime) {
                const { sendCalendarInvites } = await import('@/lib/calendar-sync')
                await sendCalendarInvites(meeting as any)
            }
        } catch (error) {
            console.error('Failed to send calendar invites:', error)
        }

        return NextResponse.json(meeting)
    } catch (error: any) {
        console.error('Create meeting error:', error)
        // Log to file for debugging
        try {
            const fs = await import('fs')
            fs.appendFileSync('error.log', `${new Date().toISOString()} - Create Meeting Error: ${error.message}\n${error.stack}\n`)
        } catch (e) {
            // Ignore file write error
        }
        return NextResponse.json({ error: 'Failed to create meeting', details: error.message }, { status: 500 })
    }
}
