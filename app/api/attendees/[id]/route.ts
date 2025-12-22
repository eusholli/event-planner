import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { findLinkedInUrl, generateBio } from '@/lib/enrichment'

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const { canWrite } = await import('@/lib/roles')
        const { currentUser } = await import('@clerk/nextjs/server')
        const { uploadImageToR2, deleteImageFromR2, fetchAndUploadImageToR2 } = await import('@/lib/storage')

        // 1. Check Permissions
        const hasAdminAccess = await canWrite()
        let hasAccess = hasAdminAccess

        if (!hasAccess) {
            const user = await currentUser()
            if (user?.emailAddresses?.some(e => e.emailAddress)) {
                // Check if the user is trying to edit their own record
                const attendeeToCheck = await prisma.attendee.findUnique({
                    where: { id },
                    select: { email: true }
                })

                if (attendeeToCheck && user.emailAddresses.some(e => e.emailAddress === attendeeToCheck.email)) {
                    hasAccess = true
                }
            }
        }

        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 2. Fetch Existing Attendee (for old image handling)
        const existingAttendee = await prisma.attendee.findUnique({
            where: { id }
        })

        if (!existingAttendee) {
            return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
        }

        // 3. Parse Form Data
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

        let finalImageUrl = existingAttendee.imageUrl

        // Validation
        if (!name || !title || !company || !email) {
            return NextResponse.json({ error: 'Name, Title, Company, and Email cannot be empty.' }, { status: 400 })
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

        const attendee = await prisma.attendee.update({
            where: { id },
            data: {
                name,
                title,
                email,
                bio,
                company,
                companyDescription,
                linkedin,
                imageUrl: finalImageUrl,
                isExternal,
                type,
            },
        })

        return NextResponse.json(attendee)
    } catch (error) {
        console.error('Update error:', error)
        return NextResponse.json({ error: 'Failed to update attendee' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const { canWrite } = await import('@/lib/roles')
        const { deleteImageFromR2 } = await import('@/lib/storage')

        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Fetch attendee first to get the image URL
        const attendee = await prisma.attendee.findUnique({
            where: { id },
            select: { imageUrl: true }
        })

        if (attendee?.imageUrl) {
            await deleteImageFromR2(attendee.imageUrl)
        }

        await prisma.attendee.delete({
            where: { id },
        })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete error:', error)
        return NextResponse.json({ error: 'Failed to delete attendee' }, { status: 500 })
    }
}
