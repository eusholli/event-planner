import { NextResponse } from 'next/server'
import { resolveEventId } from '@/lib/events'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

const GETHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const checklist = await prisma.eventMarketingChecklist.findUnique({
            where: { eventId: id },
        })

        return NextResponse.json({ checklist })
    } catch (error) {
        console.error('Error fetching marketing checklist:', error)
        return NextResponse.json({ error: 'Failed to fetch checklist' }, { status: 500 })
    }
}, { requireEventAccess: true, requireRole: 'manageEvents' })

const PUTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const data = await request.json()
        const result = await prisma.eventMarketingChecklist.upsert({
            where: { eventId: id },
            create: { eventId: id, ...data },
            update: data,
        })

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Error saving marketing checklist:', error)
        return NextResponse.json({ error: error.message || 'Failed to save checklist' }, { status: 500 })
    }
}, { requireEventAccess: true, requireRole: 'manageEvents' })

export const GET = GETHandler as any
export const PUT = PUTHandler as any
