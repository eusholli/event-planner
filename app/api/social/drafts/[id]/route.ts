import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

async function putHandler(
    request: Request,
    { params }: { params: Promise<Record<string, string>> }
) {
    const id = (await params).id
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const draft = await prisma.linkedInDraft.findUnique({
            where: { id },
        })

        if (!draft) {
            return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
        }

        const body = await request.json()

        const updated = await prisma.linkedInDraft.update({
            where: { id },
            data: {
                ...(body.content !== undefined && { content: body.content }),
                ...(body.originalContent !== undefined && { originalContent: body.originalContent }),
                ...(body.status !== undefined && { status: body.status }),
                ...(body.datePosted !== undefined && { datePosted: body.datePosted ? new Date(body.datePosted) : null }),
                ...(body.postUrl !== undefined && { postUrl: body.postUrl }),
                ...(body.impressions !== undefined && { impressions: body.impressions }),
                ...(body.uniqueViews !== undefined && { uniqueViews: body.uniqueViews }),
                ...(body.clicks !== undefined && { clicks: body.clicks }),
                ...(body.reactions !== undefined && { reactions: body.reactions }),
                ...(body.comments !== undefined && { comments: body.comments }),
                ...(body.reposts !== undefined && { reposts: body.reposts }),
                ...(body.engagementRate !== undefined && { engagementRate: body.engagementRate }),
                ...(body.followsGained !== undefined && { followsGained: body.followsGained }),
                ...(body.profileVisits !== undefined && { profileVisits: body.profileVisits }),
            },
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Error updating LinkedIn draft:', error)
        return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
    }
}

async function deleteHandler(
    request: Request,
    { params }: { params: Promise<Record<string, string>> }
) {
    const id = (await params).id
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const draft = await prisma.linkedInDraft.findUnique({
            where: { id },
        })

        if (!draft) {
            return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
        }

        await prisma.linkedInDraft.delete({
            where: { id },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting LinkedIn draft:', error)
        return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 })
    }
}

export const PUT = putHandler
export const DELETE = deleteHandler
