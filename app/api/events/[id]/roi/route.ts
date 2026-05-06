import { NextResponse } from 'next/server'
import { resolveEventId } from '@/lib/events'
import prisma from '@/lib/prisma'
import {
    saveROITargets,
    getROITargets,
    getROIActuals,
    submitROIForApproval,
    approveROI,
    rejectROI,
    resetROIToDraft,
} from '@/lib/actions/roi'
import { canManageEvents, isRootUser } from '@/lib/roles'
import { withAuth, AuthContext } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

const GETHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const [targets, actuals, event] = await Promise.all([
            getROITargets(id),
            getROIActuals(id),
            prisma.event.findUnique({ where: { id }, select: { status: true } }),
        ])

        return NextResponse.json({ targets, actuals, eventStatus: event?.status ?? null })
    } catch (error) {
        console.error('Error fetching ROI data:', error)
        return NextResponse.json({ error: 'Failed to fetch ROI data' }, { status: 500 })
    }
}, { requireEventAccess: true })

const PUTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const json = await request.json()
        const result = await saveROITargets(id, json)
        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Error saving ROI targets:', error)
        return NextResponse.json({ error: error.message || 'Failed to save ROI targets' }, { status: 500 })
    }
}, { requireRole: 'write', requireEventAccess: true })

const POSTHandler = withAuth(async (request, ctx) => {
    const authCtx = ctx.authCtx as AuthContext
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const json = await request.json()
        const { action } = json

        if (action === 'submit') {
            if (!await canManageEvents()) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
            const result = await submitROIForApproval(id)
            return NextResponse.json(result)
        }

        if (action === 'approve') {
            if (!await isRootUser()) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
            const result = await approveROI(id, authCtx.userId || 'system')
            return NextResponse.json(result)
        }

        if (action === 'reject') {
            if (!await isRootUser()) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
            const result = await rejectROI(id, authCtx.userId || 'system')
            return NextResponse.json(result)
        }

        if (action === 'reset_to_draft') {
            if (!await isRootUser()) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
            const result = await resetROIToDraft(id)
            return NextResponse.json(result)
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    } catch (error: any) {
        console.error('Error processing ROI action:', error)
        return NextResponse.json({ error: error.message || 'Failed to process ROI action' }, { status: 500 })
    }
}, { requireRole: 'write', requireEventAccess: true })

export const GET = GETHandler as any
export const PUT = PUTHandler as any
export const POST = POSTHandler as any
