import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isRootUser } from '@/lib/roles'
import { geocodeAddress } from '@/lib/geocoding'

export const dynamic = 'force-dynamic'

// Helper: Resolve a company by name or ID, creating if needed
async function resolveCompany(companyName: string, description?: string, pipelineValue?: number | null): Promise<string> {
    const existing = await prisma.company.findUnique({ where: { name: companyName } })
    if (existing) {
        return existing.id
    }
    const created = await prisma.company.create({
        data: {
            name: companyName,
            description: description || null,
            pipelineValue: pipelineValue || null,
        }
    })
    return created.id
}

export async function POST(request: Request) {
    try {
        if (!await isRootUser()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const json = await request.json()
        const { systemSettings, events } = json

        // 1. Restore System Settings
        if (systemSettings) {
            const existing = await prisma.systemSettings.findFirst()

            const updateData: any = {}
            if (systemSettings.geminiApiKey !== undefined) updateData.geminiApiKey = systemSettings.geminiApiKey
            if (systemSettings.defaultTags !== undefined) updateData.defaultTags = systemSettings.defaultTags
            if (systemSettings.defaultMeetingTypes !== undefined) updateData.defaultMeetingTypes = systemSettings.defaultMeetingTypes
            if (systemSettings.defaultAttendeeTypes !== undefined) updateData.defaultAttendeeTypes = systemSettings.defaultAttendeeTypes

            if (existing) {
                await prisma.systemSettings.update({
                    where: { id: existing.id },
                    data: updateData
                })
            } else {
                await prisma.systemSettings.create({
                    data: {
                        geminiApiKey: systemSettings.geminiApiKey,
                        defaultTags: systemSettings.defaultTags || [],
                        defaultMeetingTypes: systemSettings.defaultMeetingTypes || [],
                        defaultAttendeeTypes: systemSettings.defaultAttendeeTypes || []
                    }
                })
            }
        }

        // 2. Restore Companies (new format)
        if (json.companies && Array.isArray(json.companies)) {
            for (const comp of json.companies) {
                await prisma.company.upsert({
                    where: { id: comp.id },
                    create: {
                        id: comp.id,
                        name: comp.name,
                        description: comp.description,
                        pipelineValue: comp.pipelineValue,
                    },
                    update: {
                        name: comp.name,
                        description: comp.description,
                        pipelineValue: comp.pipelineValue,
                    }
                }).catch(e => console.warn('Company import skip', e))
            }
        }

        // 3. Restore Global Attendees
        if (json.attendees && Array.isArray(json.attendees)) {
            for (const att of json.attendees) {
                let companyId = att.companyId

                // Backwards compatibility: If old format with company string
                if (!companyId && att.company && typeof att.company === 'string') {
                    companyId = await resolveCompany(att.company, att.companyDescription, att.pipelineValue)
                }

                if (!companyId) {
                    console.warn('Attendee import skip - no companyId:', att.name)
                    continue
                }

                await prisma.attendee.upsert({
                    where: { id: att.id },
                    create: {
                        id: att.id,
                        name: att.name,
                        email: att.email,
                        title: att.title,
                        companyId,
                        bio: att.bio,
                        linkedin: att.linkedin,
                        imageUrl: att.imageUrl,
                        isExternal: att.isExternal,
                        type: att.type,
                        seniorityLevel: att.seniorityLevel
                    },
                    update: {
                        name: att.name,
                        email: att.email,
                        title: att.title,
                        companyId,
                        bio: att.bio,
                        linkedin: att.linkedin,
                        imageUrl: att.imageUrl,
                        isExternal: att.isExternal,
                        type: att.type,
                        seniorityLevel: att.seniorityLevel
                    }
                }).catch(e => console.warn('Global Attendee import skip', e))
            }
        }

        // 4. Restore Events and their scoped data
        if (events && Array.isArray(events)) {
            for (const evt of events) {
                // Upsert Event
                const eventUpdate: any = {}
                if (evt.name !== undefined) eventUpdate.name = evt.name
                if (evt.startDate !== undefined) eventUpdate.startDate = evt.startDate
                if (evt.endDate !== undefined) eventUpdate.endDate = evt.endDate
                if (evt.status !== undefined) eventUpdate.status = evt.status
                if (evt.region !== undefined) eventUpdate.region = evt.region
                if (evt.url !== undefined) eventUpdate.url = evt.url
                if (evt.budget !== undefined) eventUpdate.budget = evt.budget
                if (evt.targetCustomers !== undefined) eventUpdate.targetCustomers = evt.targetCustomers
                if (evt.requesterEmail !== undefined) eventUpdate.requesterEmail = evt.requesterEmail
                if (evt.tags !== undefined) eventUpdate.tags = evt.tags
                if (evt.meetingTypes !== undefined) eventUpdate.meetingTypes = evt.meetingTypes
                if (evt.attendeeTypes !== undefined) eventUpdate.attendeeTypes = evt.attendeeTypes
                if (evt.address !== undefined) eventUpdate.address = evt.address
                if (evt.timezone !== undefined) eventUpdate.timezone = evt.timezone
                if (evt.slug !== undefined) eventUpdate.slug = evt.slug
                if (evt.password !== undefined) eventUpdate.password = evt.password
                if (evt.description !== undefined) eventUpdate.description = evt.description
                if (evt.authorizedUserIds !== undefined) eventUpdate.authorizedUserIds = evt.authorizedUserIds
                if (evt.boothLocation !== undefined) eventUpdate.boothLocation = evt.boothLocation

                // Geocode if address exists but coords are missing
                let latitude = (evt as any).latitude
                let longitude = (evt as any).longitude

                if (evt.address && (latitude === undefined || longitude === undefined)) {
                    try {
                        const geo = await geocodeAddress(evt.address)
                        if (geo) {
                            latitude = geo.latitude
                            longitude = geo.longitude
                        }
                    } catch (e) {
                        console.error('Import geocoding failed for event:', evt.name, e)
                    }
                }

                if (latitude !== undefined) eventUpdate.latitude = latitude
                if (longitude !== undefined) eventUpdate.longitude = longitude

                // Prepare Linkage for Normalized Import
                let attendeeConnects: any = undefined
                if (evt.attendeeIds && Array.isArray(evt.attendeeIds)) {
                    attendeeConnects = evt.attendeeIds.map((id: string) => ({ id }))
                }

                const event = await prisma.event.upsert({
                    where: { id: evt.id || 'new_impossible_id' },
                    create: {
                        id: evt.id,
                        name: evt.name,
                        slug: evt.slug || (evt.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (evt.id ? evt.id.slice(-5) : Math.random().toString(36).substring(2, 7)),
                        startDate: evt.startDate,
                        endDate: evt.endDate,
                        status: evt.status,
                        region: evt.region,
                        url: evt.url,
                        budget: evt.budget,
                        targetCustomers: evt.targetCustomers,
                        requesterEmail: evt.requesterEmail,
                        tags: evt.tags || [],
                        meetingTypes: evt.meetingTypes || [],
                        attendeeTypes: evt.attendeeTypes || [],
                        address: evt.address,
                        latitude,
                        longitude,
                        timezone: evt.timezone,
                        password: evt.password,
                        description: evt.description,
                        authorizedUserIds: evt.authorizedUserIds || [],
                        boothLocation: evt.boothLocation || '',
                        attendees: attendeeConnects ? { connect: attendeeConnects } : undefined
                    },
                    update: {
                        ...eventUpdate,
                        attendees: attendeeConnects ? { connect: attendeeConnects } : undefined
                    }
                })

                const eventId = event.id

                // Restore Rooms
                if (evt.rooms) {
                    for (const room of evt.rooms) {
                        const roomUpdate: any = {}
                        if (room.name !== undefined) roomUpdate.name = room.name
                        if (room.capacity !== undefined) roomUpdate.capacity = room.capacity

                        await prisma.room.upsert({
                            where: { id: room.id },
                            create: {
                                id: room.id,
                                name: room.name,
                                capacity: room.capacity,
                                eventId
                            },
                            update: roomUpdate
                        }).catch(e => console.warn('Room skip', e))
                    }
                }

                // Restore Legacy Embedded Attendees (Backwards Compatibility)
                if (!json.attendees && evt.attendees) {
                    for (const att of evt.attendees) {
                        let companyId = att.companyId

                        // Legacy: company was a string
                        if (!companyId && att.company && typeof att.company === 'string') {
                            companyId = await resolveCompany(att.company, att.companyDescription, att.pipelineValue)
                        }

                        if (!companyId) {
                            console.warn('Legacy attendee import skip - no companyId:', att.name)
                            continue
                        }

                        const attUpdate: any = {}
                        if (att.name !== undefined) attUpdate.name = att.name
                        if (att.email !== undefined) attUpdate.email = att.email
                        if (att.title !== undefined) attUpdate.title = att.title
                        attUpdate.companyId = companyId
                        if (att.bio !== undefined) attUpdate.bio = att.bio
                        if (att.linkedin !== undefined) attUpdate.linkedin = att.linkedin
                        if (att.imageUrl !== undefined) attUpdate.imageUrl = att.imageUrl
                        if (att.isExternal !== undefined) attUpdate.isExternal = att.isExternal
                        if (att.type !== undefined) attUpdate.type = att.type
                        if (att.seniorityLevel !== undefined) attUpdate.seniorityLevel = att.seniorityLevel

                        await prisma.attendee.upsert({
                            where: { id: att.id },
                            create: {
                                id: att.id,
                                name: att.name,
                                email: att.email,
                                title: att.title,
                                companyId,
                                bio: att.bio,
                                linkedin: att.linkedin,
                                imageUrl: att.imageUrl,
                                isExternal: att.isExternal,
                                type: att.type,
                                seniorityLevel: att.seniorityLevel,
                                events: {
                                    connect: { id: eventId }
                                }
                            },
                            update: {
                                ...attUpdate,
                                events: {
                                    connect: { id: eventId }
                                }
                            }
                        }).catch(e => console.warn('Attendee skip', e))
                    }
                }

                // Meetings restoration
                if (evt.meetings) {
                    for (const mtg of evt.meetings) {
                        let attendeeConnects: any = undefined
                        if (mtg.attendees !== undefined) {
                            attendeeConnects = mtg.attendees?.map((a: any) => {
                                if (typeof a === 'string') return { id: a }
                                return { id: a.id }
                            }) || []
                        }

                        const mtgUpdate: any = {}
                        if (mtg.title !== undefined) mtgUpdate.title = mtg.title
                        if (mtg.purpose !== undefined) mtgUpdate.purpose = mtg.purpose
                        if (mtg.date !== undefined) mtgUpdate.date = mtg.date
                        if (mtg.startTime !== undefined) mtgUpdate.startTime = mtg.startTime
                        if (mtg.endTime !== undefined) mtgUpdate.endTime = mtg.endTime
                        if (mtg.roomId !== undefined) mtgUpdate.roomId = mtg.roomId
                        if (attendeeConnects !== undefined) {
                            mtgUpdate.attendees = { set: attendeeConnects }
                        }
                        if (mtg.sequence !== undefined) mtgUpdate.sequence = mtg.sequence
                        if (mtg.status !== undefined) mtgUpdate.status = mtg.status
                        if (mtg.tags !== undefined) mtgUpdate.tags = mtg.tags
                        if (mtg.calendarInviteSent !== undefined) mtgUpdate.calendarInviteSent = mtg.calendarInviteSent
                        if (mtg.createdBy !== undefined) mtgUpdate.createdBy = mtg.createdBy
                        if (mtg.isApproved !== undefined) mtgUpdate.isApproved = mtg.isApproved
                        if (mtg.meetingType !== undefined) mtgUpdate.meetingType = mtg.meetingType
                        if (mtg.otherDetails !== undefined) mtgUpdate.otherDetails = mtg.otherDetails
                        if (mtg.requesterEmail !== undefined) mtgUpdate.requesterEmail = mtg.requesterEmail
                        if (mtg.location !== undefined) mtgUpdate.location = mtg.location

                        const createConnects = mtg.attendees?.map((a: any) => {
                            if (typeof a === 'string') return { id: a }
                            return { id: a.id }
                        }) || []

                        await prisma.meeting.upsert({
                            where: { id: mtg.id },
                            create: {
                                id: mtg.id,
                                title: mtg.title,
                                date: mtg.date,
                                startTime: mtg.startTime,
                                endTime: mtg.endTime,
                                eventId,
                                roomId: mtg.roomId,
                                attendees: {
                                    connect: createConnects
                                },
                                sequence: mtg.sequence || 0,
                                status: mtg.status || 'PIPELINE',
                                tags: mtg.tags || [],
                                calendarInviteSent: mtg.calendarInviteSent || false,
                                createdBy: mtg.createdBy,
                                isApproved: mtg.isApproved || false,
                                meetingType: mtg.meetingType,
                                otherDetails: mtg.otherDetails,
                                requesterEmail: mtg.requesterEmail,
                                location: mtg.location,
                                purpose: mtg.purpose
                            },
                            update: mtgUpdate
                        }).catch(e => console.warn('Meeting skip', e))
                    }
                }

                // Restore ROI Targets
                if (evt.roiTargets) {
                    const roi = evt.roiTargets

                    // Backwards-compat: map old field names to new
                    const targetCustomerMeetings = roi.targetCustomerMeetings ?? roi.targetBoothMeetings ?? null
                    const targetTargetedReach = roi.targetTargetedReach ?? roi.targetSocialReach ?? null
                    const targetSpeaking = roi.targetSpeaking ?? roi.targetKeynotes ?? null
                    const actualTargetedReach = roi.actualTargetedReach ?? roi.actualSocialReach ?? null
                    const actualSpeaking = roi.actualSpeaking ?? roi.actualKeynotes ?? null

                    // Handle target companies - new format uses targetCompanyIds, old format uses targetCompanies as string[]
                    let targetCompanyConnect: any = undefined
                    if (roi.targetCompanyIds && Array.isArray(roi.targetCompanyIds)) {
                        targetCompanyConnect = roi.targetCompanyIds.map((id: string) => ({ id }))
                    } else if (roi.targetCompanies && Array.isArray(roi.targetCompanies)) {
                        const companyIds: string[] = []
                        for (const name of roi.targetCompanies) {
                            if (typeof name === 'string') {
                                const companyId = await resolveCompany(name)
                                companyIds.push(companyId)
                            }
                        }
                        targetCompanyConnect = companyIds.map(id => ({ id }))
                    }

                    const roiData = {
                        expectedPipeline: roi.expectedPipeline,
                        winRate: roi.winRate,
                        expectedRevenue: roi.expectedRevenue,
                        targetCustomerMeetings,
                        targetTargetedReach,
                        targetSpeaking,
                        targetMediaPR: roi.targetMediaPR,
                        targetCompanies: targetCompanyConnect ? { connect: targetCompanyConnect } : undefined,
                        actualTargetedReach,
                        actualSpeaking,
                        actualMediaPR: roi.actualMediaPR,
                        status: roi.status || 'DRAFT',
                        approvedBy: roi.approvedBy,
                        approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null,
                        submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null,
                        rejectedBy: roi.rejectedBy ?? null,
                        rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null,
                    }

                    await prisma.eventROITargets.upsert({
                        where: { eventId },
                        create: { eventId, ...roiData },
                        update: {
                            ...roiData,
                            targetCompanies: targetCompanyConnect ? { set: targetCompanyConnect } : undefined,
                        },
                    }).catch(e => console.warn('ROI targets import skip', e))
                }
            }
        }

        return NextResponse.json({ success: true, message: 'System restored successfully' })
    } catch (error) {
        console.error('System import error:', error)
        return NextResponse.json({ error: 'Failed to import system' }, { status: 500 })
    }
}
