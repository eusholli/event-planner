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
        const { title, purpose, startTime, endTime, roomId, attendeeIds } = body

        const start = new Date(startTime)
        const end = new Date(endTime)

        // 1. Check Room Availability
        if (roomId) {
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

        // 2. Check Attendee Availability
        if (attendeeIds && attendeeIds.length > 0) {
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

        const meeting = await prisma.meeting.create({
            data: {
                title,
                purpose,
                startTime: start,
                endTime: end,
                roomId,
                attendees: {
                    connect: attendeeIds.map((id: string) => ({ id })),
                },
            },
            include: {
                room: true,
                attendees: true,
            }
        })

        // Send Calendar Invites
        try {
            const { sendCalendarInvites } = await import('@/lib/calendar-sync')
            await sendCalendarInvites(meeting)
        } catch (error) {
            console.error('Failed to send calendar invites:', error)
        }

        return NextResponse.json(meeting)
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 })
    }
}
