import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isRootUser } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        if (!await isRootUser()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const json = await request.json()
        const { systemSettings, events } = json

        // Transaction? Might be too big for one transaction if large dataset.
        // We'll do it sequentially.

        // 1. Restore System Settings
        if (systemSettings) {
            const existing = await prisma.systemSettings.findFirst()
            if (existing) {
                await prisma.systemSettings.update({
                    where: { id: existing.id },
                    data: { geminiApiKey: systemSettings.geminiApiKey }
                })
            } else {
                await prisma.systemSettings.create({
                    data: { geminiApiKey: systemSettings.geminiApiKey }
                })
            }
        }

        // 2. Restore Events and their scoped data
        if (events && Array.isArray(events)) {
            for (const evt of events) {
                // Upsert Event
                const event = await prisma.event.upsert({
                    where: { id: evt.id || 'new_impossible_id' },
                    create: {
                        id: evt.id, // Try to preserve ID
                        name: evt.name,
                        startDate: evt.startDate,
                        endDate: evt.endDate,
                        status: evt.status,
                        region: evt.region,
                        url: evt.url,
                        budget: evt.budget,
                        targetCustomers: evt.targetCustomers,
                        expectedRoi: evt.expectedRoi,
                        requesterEmail: evt.requesterEmail,
                        tags: evt.tags || [],
                        meetingTypes: evt.meetingTypes || [],
                        attendeeTypes: evt.attendeeTypes || [],
                        address: evt.address,
                        timezone: evt.timezone
                    },
                    update: {
                        name: evt.name,
                        startDate: evt.startDate,
                        endDate: evt.endDate,
                        status: evt.status,
                        region: evt.region,
                        url: evt.url,
                        budget: evt.budget,
                        targetCustomers: evt.targetCustomers,
                        expectedRoi: evt.expectedRoi,
                        requesterEmail: evt.requesterEmail,
                        tags: evt.tags || [],
                        meetingTypes: evt.meetingTypes || [],
                        attendeeTypes: evt.attendeeTypes || [],
                        address: evt.address,
                        timezone: evt.timezone
                    }
                })

                const eventId = event.id

                // Restore Rooms
                if (evt.rooms) {
                    for (const room of evt.rooms) {
                        await prisma.room.upsert({
                            where: { id: room.id },
                            create: {
                                id: room.id,
                                name: room.name,
                                capacity: room.capacity,
                                eventId
                            },
                            update: {
                                name: room.name,
                                capacity: room.capacity
                            }
                        }).catch(e => console.warn('Room skip', e))
                    }
                }

                // Restore Attendees
                if (evt.attendees) {
                    for (const att of evt.attendees) {
                        await prisma.attendee.upsert({
                            where: { id: att.id }, // Use ID if available, else standard upsert logic might fail if ID conflict?
                            // Safest to use ID if we are doing full restore.
                            create: {
                                id: att.id,
                                name: att.name,
                                email: att.email,
                                title: att.title,
                                company: att.company,
                                bio: att.bio,
                                linkedin: att.linkedin,
                                imageUrl: att.imageUrl,
                                isExternal: att.isExternal,
                                type: att.type,
                                eventId
                            },
                            update: {
                                name: att.name,
                                email: att.email,
                                title: att.title,
                                company: att.company,
                                bio: att.bio,
                                linkedin: att.linkedin,
                                imageUrl: att.imageUrl,
                                isExternal: att.isExternal,
                                type: att.type
                            }
                        }).catch(e => console.warn('Attendee skip', e))
                    }
                }

                // Meetings restoration is complex due to Many-to-Many via implicit or explicit tables.
                // In Schema: Meeting has `attendees Attendee[]`. Prisma handles this as implicit unless explicit join table.
                // We need to connect them.
                if (evt.meetings) {
                    for (const mtg of evt.meetings) {
                        // Prepare attendee connections
                        const attendeeConnects = mtg.attendees?.map((a: any) => ({ id: a.id })) || []

                        await prisma.meeting.upsert({
                            where: { id: mtg.id },
                            create: {
                                id: mtg.id,
                                title: mtg.title,
                                date: mtg.date,
                                startTime: mtg.startTime,
                                endTime: mtg.endTime,
                                eventId,
                                roomId: mtg.roomId, // Assuming room ID was preserved and restored above
                                attendees: {
                                    connect: attendeeConnects
                                }
                            },
                            update: {
                                title: mtg.title,
                                date: mtg.date,
                                startTime: mtg.startTime,
                                endTime: mtg.endTime,
                                roomId: mtg.roomId,
                                attendees: {
                                    set: attendeeConnects // Reset and re-connect
                                }
                            }
                        }).catch(e => console.warn('Meeting skip', e))
                    }
                }
            }
        }

        return NextResponse.json({ success: true, message: 'System restored successfully' })
    } catch (error) {
        console.error('System import error:', error)
        return NextResponse.json({ error: 'Failed to import system' }, { status: 500 })
    }
}
