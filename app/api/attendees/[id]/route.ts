import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { findLinkedInUrl, generateBio } from '@/lib/enrichment'

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id
    try {
        const body = await request.json()
        let { name, title, email, bio, company, companyDescription, linkedin, imageUrl, isExternal } = body

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
        await prisma.attendee.delete({
            where: { id },
        })
        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete attendee' }, { status: 500 })
    }
}
