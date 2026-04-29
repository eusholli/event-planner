import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { canManageEvents, isRootUser } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth()
        if (!userId || !await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { id } = await params
        const body = await request.json()

        const existing = await prisma.linkedInDraft.findUnique({ where: { id } })
        if (!existing) {
            return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
        }

        const updated = await prisma.linkedInDraft.update({
            where: { id },
            data: {
                ...(body.content !== undefined && { content: body.content }),
                ...(body.originalContent !== undefined && { originalContent: body.originalContent }),
                ...(body.title !== undefined && { title: body.title }),
                ...(body.status !== undefined && { status: body.status }),
                ...(body.adStartDate !== undefined && { adStartDate: body.adStartDate ? new Date(body.adStartDate) : null }),
                ...(body.adEndDate !== undefined && { adEndDate: body.adEndDate ? new Date(body.adEndDate) : null }),
                ...(body.ctaUrl !== undefined && { ctaUrl: body.ctaUrl }),
                ...(body.impressions !== undefined && { impressions: body.impressions }),
                ...(body.clicks !== undefined && { clicks: body.clicks }),
                ...(body.averageCtr !== undefined && { averageCtr: body.averageCtr }),
                ...(body.averageCpc !== undefined && { averageCpc: body.averageCpc }),
                ...(body.topCompaniesByEngagement !== undefined && { topCompaniesByEngagement: body.topCompaniesByEngagement }),
            },
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Error updating LinkedIn draft:', error)
        return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth()
        if (!userId || !await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { id } = await params
        const existing = await prisma.linkedInDraft.findUnique({ where: { id } })
        if (!existing) {
            return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
        }

        const rootUser = await isRootUser()
        if (existing.createdBy !== userId && !rootUser) {
            return NextResponse.json({ error: 'Forbidden: can only delete your own drafts' }, { status: 403 })
        }

        await prisma.linkedInDraft.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting LinkedIn draft:', error)
        return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 })
    }
}
