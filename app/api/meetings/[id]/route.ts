import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

        return NextResponse.json(meeting)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch meeting' }, { status: 500 })
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const id = (await params).id
    try {
        const body = await request.json()

        // LOCK CHECK
        const { isEventEditable } = await import('@/lib/events')
        const currentMeeting = await prisma.meeting.findUnique({ where: { id }, select: { eventId: true } })

        if (!currentMeeting) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
        }

        if (currentMeeting.eventId) {
            if (!await isEventEditable(currentMeeting.eventId)) {
                return NextResponse.json({
                    error: 'Event has occurred and is read-only.'
                }, { status: 403 })
            }
        }

        const {
            title,
            purpose,
            date,
            startTime,
            endTime,
            roomId,
            attendeeIds,
            status,
            tags,
            requesterEmail,
            meetingType,
            location,
            otherDetails,
            isApproved,
            calendarInviteSent
        } = body

        // Basic title validation for all meetings
        if (!title || title.trim() === '') {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 })
        }

        // Validate COMPLETED status requirements
        if (status === 'COMPLETED') {
            if (!date || !startTime || !endTime) {
                return NextResponse.json({ error: 'Date, Start time, and End time are required for completed meetings' }, { status: 400 })
            }
            if (!roomId && !location) {
                return NextResponse.json({ error: 'Room or Location is required for completed meetings' }, { status: 400 })
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

        // 1. Check Room Availability (excluding current meeting, only if room, date, and times provided)
        if (roomId && date && startTime && endTime) {
            const roomConflicts = await prisma.meeting.findMany({
                where: {
                    roomId,
                    id: { not: id }, // Exclude current meeting
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

        // 2. Check Attendee Availability (excluding current meeting, only if attendees, date, and times provided)
        if (attendeeIds && attendeeIds.length > 0 && date && startTime && endTime) {
            const attendeeConflicts = await prisma.meeting.findMany({
                where: {
                    id: { not: id }, // Exclude current meeting
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
                const conflictedAttendeeIds = new Set<string>()
                attendeeConflicts.forEach((m: any) => {
                    m.attendees.forEach((a: any) => {
                        if (attendeeIds.includes(a.id)) {
                            conflictedAttendeeIds.add(a.name)
                        }
                    })
                })

                return NextResponse.json({
                    error: `The following attendees are busy: ${Array.from(conflictedAttendeeIds).join(', ')}`
                }, { status: 409 })
            }
        }

        // Prepare update data
        const updateData: any = {
            title,
            purpose,
            date,
            startTime,
            endTime,
            requesterEmail,
            meetingType,
            location,
            otherDetails,
            isApproved,
            calendarInviteSent
        }

        // Only add room if provided
        if (roomId !== undefined) {
            updateData.roomId = roomId || null
        }

        // Only add attendees if provided
        if (attendeeIds !== undefined) {
            updateData.attendees = {
                set: [], // Clear existing
                connect: attendeeIds.length > 0 ? attendeeIds.map((id: string) => ({ id })) : [],
            }
        }

        // Only update status if provided
        if (status !== undefined) {
            updateData.status = status
        }

        // Only update tags if provided
        if (tags !== undefined) {
            updateData.tags = tags
        }

        // Force clear room and location if status is CANCELED
        if (status === 'CANCELED') {
            updateData.roomId = null;
            updateData.location = null;
        }

        const meeting = await prisma.meeting.update({
            where: { id },
            data: updateData,
            include: {
                room: true,
                attendees: true,
            }
        })

        // Increment sequence for update
        const updatedMeeting = await prisma.meeting.update({
            where: { id },
            data: { sequence: { increment: 1 } },
            include: { room: true, attendees: true }
        })

        // Send Calendar Updates
        try {
            if (updatedMeeting.date && updatedMeeting.startTime && updatedMeeting.endTime) {
                const { sendCalendarInvites } = await import('@/lib/calendar-sync')
                await sendCalendarInvites(updatedMeeting as any)
            }
        } catch (error) {
            console.error('Failed to send calendar updates:', error)
        }

        return NextResponse.json(updatedMeeting)
    } catch (error: any) {
        console.error('Update meeting error:', error)
        return NextResponse.json({ error: 'Failed to update meeting', details: error.message }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const id = (await params).id
    try {
        const meeting = await prisma.meeting.findUnique({
            where: { id },
            include: { room: true, attendees: true }
        })

        if (!meeting) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
        }

        // LOCK CHECK
        if (meeting.eventId) {
            const { isEventEditable } = await import('@/lib/events')
            if (!await isEventEditable(meeting.eventId)) {
                return NextResponse.json({
                    error: 'Event has occurred and is read-only.'
                }, { status: 403 })
            }
        }

        if (meeting && meeting.date && meeting.startTime && meeting.endTime) {
            try {
                const { sendCalendarInvites } = await import('@/lib/calendar-sync')
                await sendCalendarInvites(meeting as any, 'CANCEL')
            } catch (error) {
                console.error('Failed to send cancellation:', error)
            }
        }

        await prisma.meeting.delete({
            where: { id },
        })
        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 })
    }
}
