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
        const body = await request.json()
        let { name, title, email, bio, company, companyDescription, linkedin, imageUrl, isExternal, type } = body

        if ((name !== undefined && !name) || (title !== undefined && !title) || (company !== undefined && !company) || (email !== undefined && !email)) {
            return NextResponse.json({ error: 'Name, Title, Company, and Email cannot be empty.' }, { status: 400 })
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
                imageUrl,
                isExternal,
                type,
            },
        })

        return NextResponse.json(attendee)
    } catch (error) {
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
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        await prisma.attendee.delete({
            where: { id },
        })
        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete attendee' }, { status: 500 })
    }
}
