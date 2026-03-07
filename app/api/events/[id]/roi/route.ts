import { NextResponse } from 'next/server'
import { resolveEventId } from '@/lib/events'
import {
    saveROITargets,
    getROITargets,
    getROIActuals,
    submitROIForApproval,
    approveROI,
    rejectROI,
} from '@/lib/actions/roi'
import { canWrite, canManageEvents, isRootUser } from '@/lib/roles'
import { auth } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const rawId = (await params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const [targets, actuals] = await Promise.all([
            getROITargets(id),
            getROIActuals(id),
        ])

        return NextResponse.json({ targets, actuals })
    } catch (error) {
        console.error('Error fetching ROI data:', error)
        return NextResponse.json({ error: 'Failed to fetch ROI data' }, { status: 500 })
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const rawId = (await params).id
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
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const rawId = (await params).id
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
            const { userId } = await auth()
            const result = await approveROI(id, userId || 'system')
            return NextResponse.json(result)
        }

        if (action === 'reject') {
            if (!await isRootUser()) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
            const { userId } = await auth()
            const result = await rejectROI(id, userId || 'system')
            return NextResponse.json(result)
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    } catch (error: any) {
        console.error('Error processing ROI action:', error)
        return NextResponse.json({ error: error.message || 'Failed to process ROI action' }, { status: 500 })
    }
}
