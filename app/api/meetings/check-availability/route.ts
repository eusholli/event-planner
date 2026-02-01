import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { date, startTime, endTime, roomId, attendeeIds, excludeMeetingId } = body

        // Validate required fields
        if (!date || !startTime || !endTime) {
            // If we don't have full time info, we can't check for conflicts effectively
            // or we might check just the date? For now, assume we need all 3.
            return NextResponse.json({ conflicts: [], suggestions: [] })
        }

        const conflicts: string[] = []

        // 1. Check Room Availability
        if (roomId) {
            const roomConflicts = await prisma.meeting.findMany({
                where: {
                    roomId,
                    id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
                    date: date,
                    OR: [
                        { startTime: { lt: endTime }, endTime: { gt: startTime } },
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
                const conflictedAttendees = new Map<string, string[]>()

                attendeeConflicts.forEach((m: any) => {
                    m.attendees.forEach((a: any) => {
                        if (attendeeIds.includes(a.id)) {
                            const existing = conflictedAttendees.get(a.name) || []
                            existing.push(m.title)
                            conflictedAttendees.set(a.name, existing)
                        }
                    })
                })

                if (conflictedAttendees.size > 0) {
                    const details = Array.from(conflictedAttendees.entries())
                        .map(([name, titles]) => `${name} (in: ${titles.join(', ')})`)
                        .join('; ')
                    conflicts.push(`The following attendees are busy: ${details}`)
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
                        date: date,
                        OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
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

            // Helper to add hours to "HH:mm" string
            const addHours = (timeStr: string, hours: number) => {
                const [h, m] = timeStr.split(':').map(Number)
                const date = new Date()
                date.setHours(h + hours, m, 0, 0)
                return date.toTimeString().slice(0, 5)
            }

            for (const offset of checkSlots) {
                const newStartTime = addHours(startTime, offset)
                const newEndTime = addHours(endTime, offset)

                // Check if this slot works for everyone
                const slotConflicts = await prisma.meeting.count({
                    where: {
                        id: excludeMeetingId ? { not: excludeMeetingId } : undefined,
                        date: date,
                        OR: [
                            // Room busy?
                            { roomId, startTime: { lt: newEndTime }, endTime: { gt: newStartTime } },
                            // Attendees busy?
                            {
                                attendees: { some: { id: { in: attendeeIds } } },
                                startTime: { lt: newEndTime },
                                endTime: { gt: newStartTime }
                            }
                        ]
                    }
                })

                if (slotConflicts === 0) {
                    suggestions.push({
                        type: 'time',
                        label: `Move to ${newStartTime}`,
                        value: { startTime: newStartTime, endTime: newEndTime }
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
