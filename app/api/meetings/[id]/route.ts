import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const body = await request.json()
        const { title, purpose, startTime, endTime, roomId, attendeeIds, status, tags } = body

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

        // 1. Check Room Availability (excluding current meeting, only if room and times provided)
        if (roomId && start && end) {
            const roomConflicts = await prisma.meeting.findMany({
                where: {
                    roomId,
                    id: { not: id }, // Exclude current meeting
                    OR: [
                        { startTime: { lt: end }, endTime: { gt: start } },
                    ],
                },
            })

            if (roomConflicts.length > 0) {
                return NextResponse.json({ error: 'Room is already booked for this time slot' }, { status: 409 })
            }
        }

        // 2. Check Attendee Availability (excluding current meeting, only if attendees and times provided)
        if (attendeeIds && attendeeIds.length > 0 && start && end) {
            const attendeeConflicts = await prisma.meeting.findMany({
                where: {
                    id: { not: id }, // Exclude current meeting
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
        }

        // Only add times if provided
        if (start && end) {
            updateData.startTime = start
            updateData.endTime = end
        } else {
            // Check if explicitly set to null to clear them
            if (startTime === null) updateData.startTime = null
            if (endTime === null) updateData.endTime = null
        }

        // Only add room if provided
        if (roomId !== undefined) {
            updateData.roomId = roomId
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
            if (updatedMeeting.startTime && updatedMeeting.endTime) {
                const { sendCalendarInvites } = await import('@/lib/calendar-sync')
                // We've verified startTime and endTime are not null, so we can cast to satisfy the type
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
    const id = (await params).id
    try {
        const meeting = await prisma.meeting.findUnique({
            where: { id },
            include: { room: true, attendees: true }
        })

        if (meeting && meeting.startTime && meeting.endTime) {
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
