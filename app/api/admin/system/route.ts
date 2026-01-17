import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isRootUser } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        // Only Root handles system settings?
        // Or maybe just return it safely? 
        // Let's protect it.
        const allow = await isRootUser()
        if (!allow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const settings = await prisma.systemSettings.findFirst()
        return NextResponse.json(settings || {}) // Return empty object if not init (though migration did init)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const allow = await isRootUser()
        if (!allow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const json = await request.json()
        const { geminiApiKey, defaultTags, defaultMeetingTypes, defaultAttendeeTypes } = json

        // Upsert logic
        const existing = await prisma.systemSettings.findFirst()

        let settings
        const data = {
            geminiApiKey,
            defaultTags: defaultTags || [],
            defaultMeetingTypes: defaultMeetingTypes || [],
            defaultAttendeeTypes: defaultAttendeeTypes || []
        }

        if (existing) {
            settings = await prisma.systemSettings.update({
                where: { id: existing.id },
                data
            })
        } else {
            settings = await prisma.systemSettings.create({
                data
            })
        }

        return NextResponse.json(settings)
    } catch (error) {
        console.error('System settings error', error)
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }
}
