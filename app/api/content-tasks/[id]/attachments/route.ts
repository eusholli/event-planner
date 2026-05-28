import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, isOwnerOrCanWrite } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (request, { params, authCtx }) => {
    const id = (await params).id
    try {
        const existing = await prisma.contentTask.findUnique({ where: { id } })
        if (!existing) return NextResponse.json({ error: 'Content task not found' }, { status: 404 })
        if (!(await isOwnerOrCanWrite(authCtx, existing.createdBy))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const title = (formData.get('title') as string | null)?.trim() || ''

        if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 })
        if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { uploadFileToR2 } = await import('@/lib/storage')
        const fileUrl = await uploadFileToR2(buffer, file.type, file.name)

        const attachment = await prisma.contentTaskAttachment.create({
            data: {
                contentTaskId: id,
                title,
                fileUrl,
                originalName: file.name,
            },
        })

        return NextResponse.json(attachment, { status: 201 })
    } catch (error) {
        console.error('Failed to upload attachment:', error)
        return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
    }
}) as any
