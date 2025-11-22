import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { startTime, endTime, roomId, attendeeIds, excludeMeetingId } = body

        const start = new Date(startTime)
        const end = new Date(endTime)
        const conflicts: string[] = []

        // 1. Check Room Availability
        if (roomId) {
            const roomConflicts = await prisma.meeting.findMany({
                where: {
                    roomId,
                    id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
                    OR: [
                        { startTime: { lt: end }, endTime: { gt: start } },
                    ],
                },
            })

            if (roomConflicts.length > 0) {
                conflicts.push('Room is already booked for this time slot.')
            }
        }

        // 2. Check Attendee Availability
        if (attendeeIds && attendeeIds.length > 0) {
            const attendeeConflicts = await prisma.meeting.findMany({
                where: {
                    id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
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
                const conflictedAttendeeNames = new Set<string>()
                attendeeConflicts.forEach((m: any) => {
                    m.attendees.forEach((a: any) => {
                        if (attendeeIds.includes(a.id)) {
                            conflictedAttendeeNames.add(a.name)
                        }
                    })
                })

                if (conflictedAttendeeNames.size > 0) {
                    conflicts.push(`The following attendees are busy: ${Array.from(conflictedAttendeeNames).join(', ')}`)
                }
            }
        }

        // 3. Smart Suggestions
        const suggestions: { type: 'room' | 'time', label: string, value: any }[] = []

        if (conflicts.length > 0) {
            // A. Suggest Alternative Rooms (if room is the issue)
            if (roomId && conflicts.some(c => c.includes('Room is already booked'))) {
                const allRooms = await prisma.room.findMany()
                const busyRoomIds = await prisma.meeting.findMany({
                    where: {
                        OR: [{ startTime: { lt: end }, endTime: { gt: start } }],
                        id: excludeMeetingId ? { not: excludeMeetingId } : undefined
                    },
                    select: { roomId: true }
                }).then((res: { roomId: string | null }[]) => res.map(r => r.roomId).filter(Boolean) as string[])

                const availableRooms = allRooms.filter((r: any) => !busyRoomIds.includes(r.id))
                availableRooms.slice(0, 3).forEach((r: any) => {
                    suggestions.push({
                        type: 'room',
                        label: `Switch to ${r.name}`,
                        value: r.id
                    })
                })
            }

            // B. Suggest Alternative Times (if attendees or room are busy)
            // Simple algorithm: Check next 3 hour slots
            const checkSlots = [1, 2, 3]
            for (const offset of checkSlots) {
                const newStart = new Date(start.getTime() + offset * 60 * 60 * 1000)
                const newEnd = new Date(end.getTime() + offset * 60 * 60 * 1000)

                // Check if this slot works for everyone
                const slotConflicts = await prisma.meeting.count({
                    where: {
                        id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
                        OR: [
                            // Room busy?
                            { roomId, startTime: { lt: newEnd }, endTime: { gt: newStart } },
                            // Attendees busy?
                            {
                                attendees: { some: { id: { in: attendeeIds } } },
                                startTime: { lt: newEnd },
                                endTime: { gt: newStart }
                            }
                        ]
                    }
                })

                if (slotConflicts === 0) {
                    suggestions.push({
                        type: 'time',
                        label: `Move to ${newStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        value: { start: newStart, end: newEnd }
                    })
                    break // Found one, stop looking
                }
            }
        }

        return NextResponse.json({ conflicts, suggestions })
    } catch (error) {
        console.error('Check availability error:', error)
        return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
    }
}
