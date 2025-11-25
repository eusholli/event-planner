import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
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
        const body = await request.json()
        let { name, title, email, bio, company, companyDescription, linkedin, imageUrl } = body

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
                imageUrl,
            },
        })
        return NextResponse.json(attendee)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 })
    }
}
