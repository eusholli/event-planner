import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
    try {
        let settings = await prisma.eventSettings.findFirst()
        console.log('GET /api/settings', settings)

        if (!settings) {
            // Create default settings if none exist
            const today = new Date()
            today.setUTCHours(0, 0, 0, 0)
            const tomorrow = new Date(today)
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

            settings = await prisma.eventSettings.create({
                data: {
                    name: 'My Event',
                    startDate: today,
                    endDate: tomorrow,
                },
            })
        }

        // Return dates in YYYY-MM-DD format
        const response = {
            ...settings,
            startDate: settings.startDate.toISOString().split('T')[0],
            endDate: settings.endDate.toISOString().split('T')[0],
            tags: settings.tags || [],
            meetingTypes: settings.meetingTypes || [],
        }

        return NextResponse.json(response)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, startDate, endDate, geminiApiKey, tags } = body

        // Parse date strings (YYYY-MM-DD) and set to midnight UTC
        const startDateObj = new Date(startDate + 'T00:00:00.000Z')
        const endDateObj = new Date(endDate + 'T00:00:00.000Z')

        // Upsert ensures we only have one settings record (or updates the first one found)
        const firstSettings = await prisma.eventSettings.findFirst()

        let settings
        if (firstSettings) {
            settings = await prisma.eventSettings.update({
                where: { id: firstSettings.id },
                data: {
                    name,
                    startDate: startDateObj,
                    endDate: endDateObj,
                    geminiApiKey,
                    tags: tags ? Array.from(new Set(tags as string[])).sort() : [],
                    meetingTypes: body.meetingTypes ? Array.from(new Set(body.meetingTypes as string[])).sort() : [],
                },
            })
        } else {
            settings = await prisma.eventSettings.create({
                data: {
                    name,
                    startDate: startDateObj,
                    endDate: endDateObj,
                    geminiApiKey,
                    tags: tags ? Array.from(new Set(tags as string[])).sort() : [],
                    meetingTypes: body.meetingTypes ? Array.from(new Set(body.meetingTypes as string[])).sort() : [],
                },
            })
        }

        // Return dates in YYYY-MM-DD format
        const response = {
            ...settings,
            startDate: settings.startDate.toISOString().split('T')[0],
            endDate: settings.endDate.toISOString().split('T')[0],
            tags: settings.tags || [],
            meetingTypes: settings.meetingTypes || [],
        }

        return NextResponse.json(response)
    } catch (error: any) {
        console.error('Error updating settings:', error)
        return NextResponse.json({ error: 'Failed to update settings', details: error.message }, { status: 500 })
    }
}
