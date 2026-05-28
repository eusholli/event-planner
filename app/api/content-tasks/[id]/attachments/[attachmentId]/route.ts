import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, isOwnerOrCanWrite } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

export const DELETE = withAuth(async (_request, { params, authCtx }) => {
    const { id, attachmentId } = await params
    try {
        const attachment = await prisma.contentTaskAttachment.findUnique({
            where: { id: attachmentId },
            include: { task: true },
        })
        if (!attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
        if (attachment.contentTaskId !== id) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

        if (!(await isOwnerOrCanWrite(authCtx, attachment.task.createdBy))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { deleteFileFromR2 } = await import('@/lib/storage')
        await deleteFileFromR2(attachment.fileUrl)
        await prisma.contentTaskAttachment.delete({ where: { id: attachmentId } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete attachment:', error)
        return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
    }
}) as any
