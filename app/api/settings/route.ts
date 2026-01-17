import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        let settings = await prisma.systemSettings.findFirst()
        
        if (!settings) {
            // Create default settings if not exists
            settings = await prisma.systemSettings.create({
                data: {
                    defaultAttendeeTypes: ['VIP', 'Speaker', 'Guest', 'Staff'],
                    defaultMeetingTypes: ['Sync', 'Review', 'Planning'],
                    defaultTags: ['Urgent', 'Follow-up'],
                }
            })
        }

        // Map to structure expected by frontend (legacy compatibility)
        return NextResponse.json({
            geminiApiKey: settings.geminiApiKey,
            attendeeTypes: settings.defaultAttendeeTypes,
            meetingTypes: settings.defaultMeetingTypes,
            tags: settings.defaultTags,
            // Provide defaults for legacy fields to avoid client errors if it expects them
            name: '',
            startDate: '',
            endDate: '',
            timezone: ''
        })
    } catch (error) {
        console.error('Error fetching settings:', error)
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const json = await request.json()
        
        let settings = await prisma.systemSettings.findFirst()

        const data = {
            geminiApiKey: json.geminiApiKey,
            defaultAttendeeTypes: json.attendeeTypes,
            defaultMeetingTypes: json.meetingTypes,
            defaultTags: json.tags
        }

        if (settings) {
            settings = await prisma.systemSettings.update({
                where: { id: settings.id },
                data
            })
        } else {
            settings = await prisma.systemSettings.create({
                data
            })
        }

        return NextResponse.json({
            geminiApiKey: settings.geminiApiKey,
            attendeeTypes: settings.defaultAttendeeTypes,
            meetingTypes: settings.defaultMeetingTypes,
            tags: settings.defaultTags,
            name: '', 
            startDate: '',
            endDate: '',
            timezone: ''
        })
    } catch (error) {
        console.error('Error updating settings:', error)
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }
}
