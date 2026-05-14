'use server'

import prisma from '@/lib/prisma'

// ---------------------------
// Types
// ---------------------------
export interface ROITargetsInput {
    expectedPipeline?: number | null
    winRate?: number | null
    expectedRevenue?: number | null
    targetCustomerMeetings?: number | null
    targetErta?: number | null
    targetSpeaking?: number | null
    targetMediaPR?: number | null
    targetEventScans?: number | null
    targetCompanyIds?: string[]
    targetCompanyNames?: string[]
    actualErta?: number | null
    actualSpeaking?: number | null
    actualMediaPR?: number | null
    actualEventScans?: number | null
    actualCost?: number | null
    budget?: number | null
    requesterEmail?: string | null
    marketingPlan?: string | null
}

export interface ROIActuals {
    actualInvestment: number
    actualPipeline: number
    actualRevenue: number
    actualCustomerMeetings: number
    targetCompaniesHit: { id: string; name: string }[]
    targetCompaniesHitCount: number
    additionalCompanies: { id: string; name: string; pipelineValue?: number | null }[]
    actualErta: number
    actualSpeaking: number
    actualMediaPR: number
    actualEventScans: number
    actualCost: number
}

// ---------------------------
// Server Actions
// ---------------------------

export async function saveROITargets(eventId: string, data: ROITargetsInput) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    const { targetCompanyIds, budget, requesterEmail, event, eventId: _eid, ...rest } = data as any

    if (budget !== undefined || requesterEmail !== undefined) {
        await prisma.event.update({
            where: { id: eventId },
            data: {
                ...(budget !== undefined && { budget }),
                ...(requesterEmail !== undefined && { requesterEmail })
            }
        })
    }

    const upsertData: any = { ...rest }

    // Handle target companies relation
    if (targetCompanyIds !== undefined) {
        upsertData.targetCompanies = {
            set: targetCompanyIds.map((id: string) => ({ id }))
        }
    }

    const result = await prisma.eventROITargets.upsert({
        where: { eventId },
        create: {
            event: { connect: { id: eventId } },
            ...rest,
            targetCompanies: targetCompanyIds
                ? { connect: targetCompanyIds.map((id: string) => ({ id })) }
                : undefined,
        },
        update: upsertData,
        include: {
            targetCompanies: true,
            event: { select: { budget: true, requesterEmail: true } }
        }
    })

    const { event: eventData, ...cleanedResult } = result as any
    return { ...cleanedResult, budget: eventData?.budget, requesterEmail: eventData?.requesterEmail }
}

export async function submitROIForApproval(eventId: string) {
    const { canManageEvents } = await import('@/lib/roles')
    if (!await canManageEvents()) throw new Error('Forbidden')

    const result = await prisma.eventROITargets.update({
        where: { eventId },
        data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            rejectedBy: null,
            rejectedAt: null,
        },
        include: {
            targetCompanies: true,
            event: { select: { budget: true, requesterEmail: true } }
        }
    })

    const { event, ...cleanedResult } = result as any
    return { ...cleanedResult, budget: event?.budget, requesterEmail: event?.requesterEmail }
}

export async function approveROI(eventId: string, approverUserId: string) {
    const { isRootUser } = await import('@/lib/roles')
    if (!await isRootUser()) throw new Error('Forbidden')

    const result = await prisma.eventROITargets.update({
        where: { eventId },
        data: {
            status: 'APPROVED',
            approvedBy: approverUserId,
            approvedAt: new Date(),
        },
        include: {
            targetCompanies: true,
            event: { select: { budget: true, requesterEmail: true } }
        }
    })

    const { event, ...cleanedResult } = result as any
    return { ...cleanedResult, budget: event?.budget, requesterEmail: event?.requesterEmail }
}

export async function rejectROI(eventId: string, rejectorUserId: string) {
    const { isRootUser } = await import('@/lib/roles')
    if (!await isRootUser()) throw new Error('Forbidden')

    const result = await prisma.eventROITargets.update({
        where: { eventId },
        data: {
            status: 'DRAFT',
            rejectedBy: rejectorUserId,
            rejectedAt: new Date(),
            approvedBy: null,
            approvedAt: null,
        },
        include: {
            targetCompanies: true,
            event: { select: { budget: true, requesterEmail: true } }
        }
    })

    const { event, ...cleanedResult } = result as any
    return { ...cleanedResult, budget: event?.budget, requesterEmail: event?.requesterEmail }
}

export async function resetROIToDraft(eventId: string) {
    const { isRootUser } = await import('@/lib/roles')
    if (!await isRootUser()) throw new Error('Forbidden')

    const result = await prisma.eventROITargets.update({
        where: { eventId },
        data: {
            status: 'DRAFT',
            approvedBy: null,
            approvedAt: null,
            rejectedBy: null,
            rejectedAt: null,
            submittedAt: null,
        },
        include: {
            targetCompanies: true,
            event: { select: { budget: true, requesterEmail: true } }
        }
    })

    const { event, ...cleanedResult } = result as any
    return { ...cleanedResult, budget: event?.budget, requesterEmail: event?.requesterEmail }
}

export async function getROITargets(eventId: string) {
    const targets = await prisma.eventROITargets.findUnique({
        where: { eventId },
        include: { targetCompanies: true, event: { select: { budget: true, requesterEmail: true } } }
    })

    if (targets) {
        const { event, ...cleanedTargets } = targets as any
        return {
            ...cleanedTargets,
            budget: event?.budget,
            requesterEmail: event?.requesterEmail,
        }
    }

    return targets
}

export async function getROIActuals(eventId: string): Promise<ROIActuals> {
    const [meetings, occurredPitchMeetings, eventWithAttendees, roiTargets] = await Promise.all([
        prisma.meeting.findMany({
            where: { eventId, status: { in: ['CONFIRMED', 'OCCURRED'] } },
            include: { attendees: { include: { company: true } } },
        }),
        prisma.meeting.findMany({
            where: { eventId, status: 'OCCURRED', pitchId: { not: null } },
            select: {
                pitchId: true,
                attendees: { select: { id: true } },
                pitch: { select: { targets: { select: { attendeeId: true } } } },
            },
        }),
        prisma.event.findUnique({
            where: { id: eventId },
            select: {
                budget: true,
                attendees: {
                    select: {
                        isExternal: true,
                        company: { select: { id: true, name: true, pipelineValue: true } }
                    }
                }
            }
        }),
        prisma.eventROITargets.findUnique({
            where: { eventId },
            include: { targetCompanies: true }
        }),
    ])

    // Pipeline: Deduplicate by company, take the company's pipelineValue
    const companyValues = new Map<string, number>()
    for (const mtg of meetings) {
        for (const att of mtg.attendees) {
            if (att.isExternal && att.company.pipelineValue) {
                const existing = companyValues.get(att.companyId) || 0
                companyValues.set(att.companyId, Math.max(existing, att.company.pipelineValue))
            }
        }
    }
    const actualPipeline = [...companyValues.values()].reduce((sum, val) => sum + val, 0)

    // Target companies hit: any event attendee from that company counts
    const targetCompanyIds = roiTargets?.targetCompanies?.map(c => c.id) || []
    const targetCompanyIdSet = new Set(targetCompanyIds)
    const attendeeCompanyIds = new Set((eventWithAttendees?.attendees ?? []).map(a => a.company.id))
    const targetCompaniesHit = (roiTargets?.targetCompanies || [])
        .filter(c => attendeeCompanyIds.has(c.id))
        .map(c => ({ id: c.id, name: c.name }))

    // Additional companies: external event attendees whose company is not in the target list
    const additionalCompanyMap = new Map<string, { id: string; name: string; pipelineValue?: number | null }>()
    let externalAttendeeCount = 0
    for (const att of eventWithAttendees?.attendees ?? []) {
        if (att.isExternal) {
            externalAttendeeCount++
            if (!targetCompanyIdSet.has(att.company.id)) {
                additionalCompanyMap.set(att.company.id, att.company)
            }
        }
    }
    const additionalCompanies = [...additionalCompanyMap.values()]

    const actualCustomerMeetings = externalAttendeeCount

    const pitchHits = new Map<string, Set<string>>()
    for (const mtg of occurredPitchMeetings) {
        if (!mtg.pitchId) continue
        const targetIds = new Set(mtg.pitch?.targets.map(t => t.attendeeId) ?? [])
        let hits = pitchHits.get(mtg.pitchId)
        if (!hits) { hits = new Set(); pitchHits.set(mtg.pitchId, hits) }
        for (const att of mtg.attendees) {
            if (targetIds.has(att.id)) hits.add(att.id)
        }
    }
    let actualMediaPR = 0
    for (const hits of pitchHits.values()) actualMediaPR += hits.size

    return {
        actualInvestment: eventWithAttendees?.budget || 0,
        actualPipeline,
        actualRevenue: actualPipeline * (roiTargets?.winRate || 0),
        actualCustomerMeetings,
        targetCompaniesHit,
        targetCompaniesHitCount: targetCompaniesHit.length,
        additionalCompanies,
        actualErta: roiTargets?.actualErta || 0,
        actualSpeaking: roiTargets?.actualSpeaking || 0,
        actualMediaPR,
        actualEventScans: roiTargets?.actualEventScans || 0,
        actualCost: roiTargets?.actualCost || 0,
    }
}
