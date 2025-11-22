import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const body = await request.json()
        const { title, purpose, startTime, endTime, roomId, attendeeIds } = body

        const start = new Date(startTime)
        const end = new Date(endTime)

        // 1. Check Room Availability (excluding current meeting)
        if (roomId) {
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

        // 2. Check Attendee Availability (excluding current meeting)
        if (attendeeIds && attendeeIds.length > 0) {
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

        // Update the meeting
        const meeting = await prisma.meeting.update({
            where: { id },
            data: {
                title,
                purpose,
                startTime: start,
                endTime: end,
                roomId,
                attendees: {
                    set: [], // Clear existing
                    connect: attendeeIds.map((id: string) => ({ id })),
                },
            },
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
            const { sendCalendarInvites } = await import('@/lib/calendar-sync')
            await sendCalendarInvites(updatedMeeting)
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

        if (meeting) {
            try {
                const { sendCalendarInvites } = await import('@/lib/calendar-sync')
                await sendCalendarInvites(meeting, 'CANCEL')
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
