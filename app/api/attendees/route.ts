import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

import { findLinkedInUrl, generateBio } from '@/lib/enrichment'

export async function GET() {
    try {
        const attendees = await prisma.attendee.findMany({
            orderBy: {
                name: 'asc'
            }
        })
        return NextResponse.json(attendees)
    } catch (error) {
        console.error('Error fetching attendees:', error)
        return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { canCreate } = await import('@/lib/roles')
        if (!await canCreate()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { uploadImageToR2, fetchAndUploadImageToR2 } = await import('@/lib/storage')

        const formData = await request.formData()

        const name = formData.get('name') as string
        const title = formData.get('title') as string
        const email = formData.get('email') as string
        let bio = formData.get('bio') as string
        const company = formData.get('company') as string
        const companyDescription = formData.get('companyDescription') as string
        let linkedin = formData.get('linkedin') as string
        const isExternal = formData.get('isExternal') === 'true'
        const type = formData.get('type') as string

        // Image Handling
        const imageFile = formData.get('imageFile') as File | null
        const imageUrlInput = formData.get('imageUrl') as string

        let finalImageUrl = ''

        if (!name || !title || !company || !email) {
            return NextResponse.json({ error: 'Name, Title, Company, and Email are required.' }, { status: 400 })
        }

        try {
            if (imageFile && imageFile.size > 0) {
                console.log('Processing uploaded file...')
                const buffer = Buffer.from(await imageFile.arrayBuffer())
                finalImageUrl = await uploadImageToR2(buffer, imageFile.type || 'image/jpeg')
            } else if (imageUrlInput) {
                console.log('Processing URL import...')
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

        // Auto-enrichment Logic
        if (!linkedin && name && company) {
            const foundUrl = await findLinkedInUrl(name, company)
            if (foundUrl) {
                linkedin = foundUrl
            }
        }

        if (!bio && linkedin && name && company) {
            const generatedBio = await generateBio(name, company, linkedin)
            if (generatedBio) {
                bio = generatedBio
            }
        }

        const attendee = await prisma.attendee.create({
            data: {
                name,
                title,
                email,
                bio,
                company,
                companyDescription,
                linkedin,
                imageUrl: finalImageUrl || null,
                isExternal,
                type,
            },
        })
        return NextResponse.json(attendee)
    } catch (error) {
        console.error('Create error:', error)
        return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 })
    }
}
