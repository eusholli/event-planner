import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { generatePlaceholderEmail } from '@/lib/attendee-utils'
import { findLinkedInUrl, generateBio } from '@/lib/enrichment'

export const dynamic = 'force-dynamic'

async function getHandler(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '25')))
        const search = searchParams.get('search') || ''
        const skip = (page - 1) * limit

        const where = search ? {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const }, emailMissing: false },
                { company: { name: { contains: search, mode: 'insensitive' as const } } }
            ]
        } : {}

        const [data, totalCount] = await Promise.all([
            prisma.attendee.findMany({
                where,
                include: { company: true, _count: { select: { events: true } } },
                orderBy: { name: 'asc' },
                skip,
                take: limit
            }),
            prisma.attendee.count({ where })
        ])

        return NextResponse.json({ data, totalCount })
    } catch (error) {
        console.error('Error fetching attendees:', error)
        return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 })
    }
}

async function postHandler(request: Request) {
    try {
        const { uploadImageToR2, fetchAndUploadImageToR2 } = await import('@/lib/storage')

        const formData = await request.formData()

        const name = formData.get('name') as string
        const title = formData.get('title') as string
        const email = formData.get('email') as string
        let bio = formData.get('bio') as string
        const companyId = formData.get('companyId') as string
        let linkedin = formData.get('linkedin') as string
        const isExternal = formData.get('isExternal') === 'true'
        const type = formData.get('type') as string
        const seniorityLevel = formData.get('seniorityLevel') as string

        if (!name || !title || !companyId) {
            return NextResponse.json({ error: 'Name, Title, and Company are required.' }, { status: 400 })
        }

        const companyRecord = await prisma.company.findUnique({ where: { id: companyId } })
        if (!companyRecord) {
            return NextResponse.json({ error: 'Company not found' }, { status: 400 })
        }

        let resolvedEmail = (email || '').trim()
        let emailMissing = false
        if (!resolvedEmail) {
            resolvedEmail = generatePlaceholderEmail()
            emailMissing = true
        }

        // If real email already exists, return the existing attendee (don't duplicate)
        if (!emailMissing) {
            const existing = await prisma.attendee.findUnique({ where: { email: resolvedEmail }, include: { company: true, _count: { select: { events: true } } } })
            if (existing) return NextResponse.json(existing)
        }

        const imageFile = formData.get('imageFile') as File | null
        const imageUrlInput = formData.get('imageUrl') as string
        let finalImageUrl = ''

        try {
            if (imageFile && imageFile.size > 0) {
                const buffer = Buffer.from(await imageFile.arrayBuffer())
                finalImageUrl = await uploadImageToR2(buffer, imageFile.type || 'image/jpeg')
            } else if (imageUrlInput) {
                try {
                    finalImageUrl = await fetchAndUploadImageToR2(imageUrlInput)
                } catch (err) {
                    console.error('Failed to import image from URL:', err)
                    return NextResponse.json({ error: 'Failed to download image from the provided URL' }, { status: 400 })
                }
            }
        } catch (storageError) {
            console.error('Storage operation failed:', storageError)
            return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
        }

        const companyName = companyRecord.name
        if (!linkedin && name && companyName) {
            const foundUrl = await findLinkedInUrl(name, companyName)
            if (foundUrl) linkedin = foundUrl
        }
        if (!bio && linkedin && name && companyName) {
            const generatedBio = await generateBio(name, companyName, linkedin)
            if (generatedBio) bio = generatedBio
        }

        const attendee = await prisma.attendee.create({
            data: {
                name,
                title,
                email: resolvedEmail,
                emailMissing,
                bio,
                companyId,
                linkedin,
                imageUrl: finalImageUrl || null,
                isExternal,
                type,
                seniorityLevel: seniorityLevel || null,
            },
            include: { company: true, _count: { select: { events: true } } }
        })
        return NextResponse.json(attendee)
    } catch (error) {
        console.error('Create error:', error)
        return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 })
    }
}

export const GET = withAuth(getHandler, { requireAuth: true }) as any
export const POST = withAuth(postHandler, { requireAuth: true }) as any
