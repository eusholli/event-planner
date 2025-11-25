import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
    try {
        let settings = await prisma.eventSettings.findFirst()
        console.log('GET /api/settings', settings)

        if (!settings) {
            // Create default settings if none exist
            settings = await prisma.eventSettings.create({
                data: {
                    name: 'My Event',
                    startDate: new Date(),
                    endDate: new Date(new Date().setDate(new Date().getDate() + 1)),
                },
            })
        }

        return NextResponse.json(settings)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, startDate, endDate, geminiApiKey, tags } = body

        // Upsert ensures we only have one settings record (or updates the first one found)
        const firstSettings = await prisma.eventSettings.findFirst()

        let settings
        if (firstSettings) {
            settings = await prisma.eventSettings.update({
                where: { id: firstSettings.id },
                data: {
                    name,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    geminiApiKey,
                    tags: tags ? tags.sort() : [],
                },
            })
        } else {
            settings = await prisma.eventSettings.create({
                data: {
                    name,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    geminiApiKey,
                    tags: tags ? tags.sort() : [],
                },
            })
        }

        return NextResponse.json(settings)
    } catch (error: any) {
        console.error('Error updating settings:', error)
        return NextResponse.json({ error: 'Failed to update settings', details: error.message }, { status: 500 })
    }
}
