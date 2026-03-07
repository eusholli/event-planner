'use server'

import prisma from '@/lib/prisma'

// ---------------------------
// Types
// ---------------------------
export interface ROITargetsInput {
    targetInvestment?: number | null
    expectedPipeline?: number | null
    winRate?: number | null
    expectedRevenue?: number | null
    targetBoothMeetings?: number | null
    targetCLevelMeetingsMin?: number | null
    targetCLevelMeetingsMax?: number | null
    targetOtherMeetings?: number | null
    targetSocialReach?: number | null
    targetKeynotes?: number | null
    targetSeminars?: number | null
    targetMediaPR?: number | null
    targetBoothSessions?: number | null
    targetCompanyIds?: string[]
    actualSocialReach?: number | null
    actualKeynotes?: number | null
    actualSeminars?: number | null
    actualMediaPR?: number | null
    actualBoothSessions?: number | null
    budget?: number | null
    requesterEmail?: string | null
}

export interface ROIActuals {
    actualInvestment: number
    actualPipeline: number
    actualRevenue: number
    actualBoothMeetings: number
    actualCLevelMeetings: number
    actualOtherMeetings: number
    actualTotalMeetings: number
    targetCompaniesHit: { id: string; name: string }[]
    targetCompaniesHitCount: number
    actualSocialReach: number
    actualKeynotes: number
    actualSeminars: number
    actualMediaPR: number
    actualBoothSessions: number
}

// Senior levels that qualify for "hitting" a target company
const SENIOR_LEVELS = ['C-Level', 'VP', 'Director']

// ---------------------------
// Server Actions
// ---------------------------

export async function saveROITargets(eventId: string, data: ROITargetsInput) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    const { targetCompanyIds, budget, requesterEmail, ...rest } = data

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
            set: targetCompanyIds.map(id => ({ id }))
        }
    }

    return prisma.eventROITargets.upsert({
        where: { eventId },
        create: {
            eventId,
            ...rest,
            targetCompanies: targetCompanyIds
                ? { connect: targetCompanyIds.map(id => ({ id })) }
                : undefined,
        },
        update: upsertData,
        include: {
            targetCompanies: true
        }
    })
}

export async function submitROIForApproval(eventId: string) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    return prisma.eventROITargets.update({
        where: { eventId },
        data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
        },
        include: { targetCompanies: true }
    })
}

export async function approveROI(eventId: string, approverUserId: string) {
    const { canManageEvents } = await import('@/lib/roles')
    if (!await canManageEvents()) throw new Error('Forbidden')

    return prisma.eventROITargets.update({
        where: { eventId },
        data: {
            status: 'APPROVED',
            approvedBy: approverUserId,
            approvedAt: new Date(),
        },
        include: { targetCompanies: true }
    })
}

export async function getROITargets(eventId: string) {
    const targets = await prisma.eventROITargets.findUnique({
        where: { eventId },
        include: { targetCompanies: true, event: { select: { budget: true, requesterEmail: true } } }
    })

    if (targets) {
        return {
            ...targets,
            targetInvestment: undefined, // ensure it's removed from UI
            budget: targets.event?.budget,
            requesterEmail: targets.event?.requesterEmail,
        }
    }

    return targets
}

export async function getROIActuals(eventId: string): Promise<ROIActuals> {
    const meetings = await prisma.meeting.findMany({
        where: { eventId, status: { in: ['CONFIRMED', 'OCCURRED'] } },
        include: { attendees: { include: { company: true } } },
    })

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    const roiTargets = await prisma.eventROITargets.findUnique({
        where: { eventId },
        include: { targetCompanies: true }
    })

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

    const actualBoothMeetings = meetings.filter(m => m.meetingType === 'Booth').length

    const actualCLevelMeetings = meetings.filter(m =>
        m.attendees.some(a => a.seniorityLevel === 'C-Level')
    ).length

    // Target companies hit: A company is "hit" if any meeting attendee from that company
    // has a senior level (C-Level, VP, or Director)
    const targetCompanyIds = roiTargets?.targetCompanies?.map(c => c.id) || []
    const seniorAttendeeCompanyIds = new Set<string>()
    for (const mtg of meetings) {
        for (const att of mtg.attendees) {
            if (targetCompanyIds.includes(att.companyId) && SENIOR_LEVELS.includes(att.seniorityLevel || '')) {
                seniorAttendeeCompanyIds.add(att.companyId)
            }
        }
    }
    const targetCompaniesHit = (roiTargets?.targetCompanies || [])
        .filter(c => seniorAttendeeCompanyIds.has(c.id))
        .map(c => ({ id: c.id, name: c.name }))

    return {
        actualInvestment: event?.budget || 0,
        actualPipeline,
        actualRevenue: actualPipeline * (roiTargets?.winRate || 0),
        actualBoothMeetings,
        actualCLevelMeetings,
        actualOtherMeetings: meetings.length - actualBoothMeetings - actualCLevelMeetings,
        actualTotalMeetings: meetings.length,
        targetCompaniesHit,
        targetCompaniesHitCount: targetCompaniesHit.length,
        actualSocialReach: roiTargets?.actualSocialReach || 0,
        actualKeynotes: roiTargets?.actualKeynotes || 0,
        actualSeminars: roiTargets?.actualSeminars || 0,
        actualMediaPR: roiTargets?.actualMediaPR || 0,
        actualBoothSessions: roiTargets?.actualBoothSessions || 0,
    }
}
