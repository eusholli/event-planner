import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const settings = await prisma.systemSettings.findFirst()
        return NextResponse.json(settings || {}) // Return empty object if not init (though migration did init)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }
}

async function handlePOST(request: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
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

export const GET = withAuth(handleGET, { requireRole: 'root' }) as any
export const POST = withAuth(handlePOST, { requireRole: 'root' }) as any
