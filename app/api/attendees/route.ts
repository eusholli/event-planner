import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { resolveEventId } from '@/lib/events'
import { withAuth } from '@/lib/with-auth'
import { generatePlaceholderEmail, isPlaceholderEmail } from '@/lib/attendee-utils'

export const dynamic = 'force-dynamic'

import { findLinkedInUrl, generateBio } from '@/lib/enrichment'

async function getHandler(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const rawEventId = searchParams.get('eventId')
        const query = searchParams.get('query')

        if (query) {
            const attendees = await prisma.attendee.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' }, emailMissing: false },
                        { company: { name: { contains: query, mode: 'insensitive' } } }
                    ]
                },
                include: { company: true },
                take: 10,
                orderBy: { name: 'asc' }
            })
            return NextResponse.json(attendees)
        }

        const all = searchParams.get('all')
        if (all === 'true') {
            const attendees = await prisma.attendee.findMany({
                include: { company: true },
                orderBy: { name: 'asc' }
            })
            return NextResponse.json(attendees)
        }

        const missingEmail = searchParams.get('missingEmail')
        if (missingEmail === 'true' && !rawEventId) {
            const attendees = await prisma.attendee.findMany({
                where: { emailMissing: true },
                include: { company: true },
                orderBy: { name: 'asc' }
            })
            return NextResponse.json(attendees)
        }

        const eventId = await resolveEventId(rawEventId || '')

        if (!eventId) {
            return NextResponse.json({ error: 'eventId or query is required' }, { status: 400 })
        }

        const where: any = { events: { some: { id: eventId } } }
        if (missingEmail === 'true') where.emailMissing = true

        const attendees = await prisma.attendee.findMany({
            where,
            include: { company: true },
            orderBy: { name: 'asc' }
        })
        return NextResponse.json(attendees)
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
        const rawEventId = formData.get('eventId') as string
        const eventId = await resolveEventId(rawEventId)

        if (!eventId) {
            return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
        }

        // LOCK CHECK
        const { isEventEditable } = await import('@/lib/events')
        if (!await isEventEditable(eventId)) {
            return NextResponse.json({
                error: 'Event has occurred and is read-only.'
            }, { status: 403 })
        }

        // Resolve email: generate placeholder if not provided
        let resolvedEmail = (email || '').trim()
        let emailMissing = false
        if (!resolvedEmail) {
            resolvedEmail = generatePlaceholderEmail()
            emailMissing = true
        }

        // Check for existing attendee (only for real emails — placeholders are unique by construction)
        const existingAttendee = !emailMissing ? await prisma.attendee.findUnique({
            where: { email: resolvedEmail },
            include: { company: true }
        }) : null

        if (existingAttendee) {
            // Link to event if not already linked
            const isLinked = await prisma.event.findFirst({
                where: {
                    id: eventId,
                    attendees: {
                        some: {
                            id: existingAttendee.id
                        }
                    }
                }
            })

            if (!isLinked) {
                await prisma.event.update({
                    where: { id: eventId },
                    data: {
                        attendees: {
                            connect: { id: existingAttendee.id }
                        }
                    }
                })
            }

            // Update seniorityLevel if provided
            if (seniorityLevel) {
                await prisma.attendee.update({
                    where: { id: existingAttendee.id },
                    data: { seniorityLevel },
                })
            }

            return NextResponse.json(existingAttendee)
        }

        // Image Handling
        const imageFile = formData.get('imageFile') as File | null
        const imageUrlInput = formData.get('imageUrl') as string

        let finalImageUrl = ''

        if (!name || !title || !companyId) {
            return NextResponse.json({ error: 'Name, Title, and Company are required.' }, { status: 400 })
        }

        // Verify company exists
        const companyRecord = await prisma.company.findUnique({ where: { id: companyId } })
        if (!companyRecord) {
            return NextResponse.json({ error: 'Company not found' }, { status: 400 })
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
        const companyName = companyRecord.name
        if (!linkedin && name && companyName) {
            const foundUrl = await findLinkedInUrl(name, companyName)
            if (foundUrl) {
                linkedin = foundUrl
            }
        }

        if (!bio && linkedin && name && companyName) {
            const generatedBio = await generateBio(name, companyName, linkedin)
            if (generatedBio) {
                bio = generatedBio
            }
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
                events: {
                    connect: { id: eventId }
                }
            },
            include: { company: true }
        })
        return NextResponse.json(attendee)
    } catch (error) {
        console.error('Create error:', error)
        return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 })
    }
}

export const GET = withAuth(getHandler, { requireAuth: true }) as any
export const POST = withAuth(postHandler, { requireAuth: true }) as any
