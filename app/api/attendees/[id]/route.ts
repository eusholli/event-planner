import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { findLinkedInUrl, generateBio } from '@/lib/enrichment'
import { withAuth } from '@/lib/with-auth'
import { generatePlaceholderEmail } from '@/lib/attendee-utils'

export const dynamic = 'force-dynamic'

async function putHandler(
    request: Request,
    { params }: { params: Promise<Record<string, string>> }
) {
    const id = (await params).id
    try {
        const { uploadImageToR2, deleteImageFromR2, fetchAndUploadImageToR2 } = await import('@/lib/storage')

        // Fetch Existing Attendee (for old image handling)
        const existingAttendee = await prisma.attendee.findUnique({
            where: { id }
        })

        if (!existingAttendee) {
            return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
        }

        // Note: Attendee is now system-wide, so we don't check for event lock on the attendee itself.
        // Editing an attendee updates it globally for all events.

        // Parse Form Data
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

        // Image Handling
        const imageFile = formData.get('imageFile') as File | null
        const imageUrlInput = formData.get('imageUrl') as string

        let finalImageUrl = existingAttendee.imageUrl

        // Validation
        if (!name || !title || !companyId) {
            return NextResponse.json({ error: 'Name, Title, and Company cannot be empty.' }, { status: 400 })
        }

        // Resolve email: keep/generate placeholder if empty, clear flag if real email provided
        const trimmedEmail = (email || '').trim()
        let resolvedEmail: string
        let newEmailMissing: boolean
        if (!trimmedEmail) {
            if (existingAttendee.emailMissing) {
                resolvedEmail = existingAttendee.email
                newEmailMissing = true
            } else {
                resolvedEmail = generatePlaceholderEmail()
                newEmailMissing = true
            }
        } else {
            resolvedEmail = trimmedEmail
            newEmailMissing = false
        }

        // Verify company exists and get name for enrichment
        const companyRecord = await prisma.company.findUnique({ where: { id: companyId } })
        if (!companyRecord) {
            return NextResponse.json({ error: 'Company not found' }, { status: 400 })
        }

        try {
            if (imageFile && imageFile.size > 0) {
                // Case A: User uploaded a file
                console.log('Processing uploaded file...')
                const buffer = Buffer.from(await imageFile.arrayBuffer())
                const uploadedUrl = await uploadImageToR2(buffer, imageFile.type || 'image/jpeg')

                finalImageUrl = uploadedUrl

                // Cleanup old image if it was on R2
                if (existingAttendee.imageUrl) {
                    await deleteImageFromR2(existingAttendee.imageUrl)
                }

            } else if (imageUrlInput && imageUrlInput !== existingAttendee.imageUrl) {
                // Case B: User provided a new URL (and didn't upload a file)
                // We fetch it and store it in R2
                console.log('Processing new URL import...')
                try {
                    const uploadedUrl = await fetchAndUploadImageToR2(imageUrlInput)
                    finalImageUrl = uploadedUrl

                    // Cleanup old image
                    if (existingAttendee.imageUrl) {
                        await deleteImageFromR2(existingAttendee.imageUrl)
                    }
                } catch (err) {
                    console.error('Failed to import image from URL:', err)
                    // Fallback: If import fails, do we reject or save the external URL?
                    // For now, let's fall back to saving the external URL directly so we don't block the user,
                    // but ideally front-end should show an error.
                    // finalImageUrl = imageUrlInput // Uncomment to fallback
                    return NextResponse.json({ error: 'Failed to download image from the provided URL' }, { status: 400 })
                }
            }
            // Case C: User cleared the image (imageUrlInput is empty string)
            // But we must be careful not to delete if they just didn't touch the form field?
            // The frontend should send the current value if unchanged.
            // If the frontend sends empty string, it means "delete".
            else if (imageUrlInput === '' && existingAttendee.imageUrl) {
                await deleteImageFromR2(existingAttendee.imageUrl)
                finalImageUrl = null
            }

        } catch (storageError) {
            console.error('Storage operation failed:', storageError)
            return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
        }

        // Auto-enrichment Logic (only if fields are missing)
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

        const attendee = await prisma.attendee.update({
            where: { id },
            data: {
                name,
                title,
                email: resolvedEmail,
                emailMissing: newEmailMissing,
                bio,
                companyId,
                linkedin,
                imageUrl: finalImageUrl,
                isExternal,
                type,
                seniorityLevel: seniorityLevel || null,
            },
            include: { company: true }
        })

        return NextResponse.json(attendee)
    } catch (error: any) {
        if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
            return NextResponse.json({ error: 'An attendee with this email already exists.' }, { status: 409 })
        }
        console.error('Update error:', error)
        return NextResponse.json({ error: 'Failed to update attendee' }, { status: 500 })
    }
}

async function deleteHandler(
    request: Request,
    { params }: { params: Promise<Record<string, string>> }
) {
    const id = (await params).id
    try {
        const { searchParams } = new URL(request.url)
        const rawEventId = searchParams.get('eventId')

        const { deleteImageFromR2 } = await import('@/lib/storage')

        // If eventId provided, we are Unlinking
        if (rawEventId) {
            const { isEventEditable, resolveEventId } = await import('@/lib/events')
            const eventId = await resolveEventId(rawEventId)
            if (!eventId) {
                return NextResponse.json({ error: 'Event not found' }, { status: 404 })
            }

            // LOCK CHECK for the specific event
            if (!await isEventEditable(eventId)) {
                return NextResponse.json({
                    error: 'Event has occurred and is read-only.'
                }, { status: 403 })
            }

            // Disconnect
            await prisma.event.update({
                where: { id: eventId },
                data: {
                    attendees: {
                        disconnect: { id }
                    }
                }
            })
            return NextResponse.json({ success: true, action: 'unlinked' })
        }

        // Otherwise, System Delete
        // Fetch attendee first to get the image URL
        const attendee = await prisma.attendee.findUnique({
            where: { id },
            select: { imageUrl: true }
        })

        if (!attendee) {
            return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
        }

        if (attendee?.imageUrl) {
            await deleteImageFromR2(attendee.imageUrl)
        }

        // Delete (automatically unlinks from all events due to implied M-N or cascade?)
        // In implicit M-N, deleting the record cleans up the link table entries.
        await prisma.attendee.delete({
            where: { id },
        })
        return NextResponse.json({ success: true, action: 'deleted' })
    } catch (error) {
        console.error('Delete error:', error)
        return NextResponse.json({ error: 'Failed to delete attendee' }, { status: 500 })
    }
}

export const PUT = withAuth(putHandler, { requireAuth: true }) as any
export const DELETE = withAuth(deleteHandler, { requireAuth: true }) as any
