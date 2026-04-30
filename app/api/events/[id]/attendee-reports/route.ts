import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { resolveEventId, isEventEditable } from '@/lib/events'
import { withAuth, isOwnerOrCanWrite } from '@/lib/with-auth'
import { hasWriteAccess } from '@/lib/role-utils'

export const dynamic = 'force-dynamic'

const GETHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const eventId = await resolveEventId(rawId)
        if (!eventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

        const attendeeId = new URL(request.url).searchParams.get('attendeeId')
        if (!attendeeId) return NextResponse.json({ error: 'attendeeId is required' }, { status: 400 })

        const record = await prisma.attendeeEventReport.findUnique({
            where: { eventId_attendeeId: { eventId, attendeeId } }
        })

        return NextResponse.json({ reportText: record?.reportText ?? null })
    } catch (error) {
        console.error('Error fetching attendee report:', error)
        return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 })
    }
}, { requireAuth: true })

const PUTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const eventId = await resolveEventId(rawId)
        if (!eventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

        const attendeeId = new URL(request.url).searchParams.get('attendeeId')
        if (!attendeeId) return NextResponse.json({ error: 'attendeeId is required' }, { status: 400 })

        // Allow write-role users OR the attendee themselves
        const attendeeRecord = await prisma.attendee.findUnique({ where: { id: attendeeId }, select: { email: true } })
        if (!await isOwnerOrCanWrite(ctx.authCtx, attendeeRecord?.email ?? null)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Enforce event lock for write-role users; attendees can update their own report post-event
        if (hasWriteAccess(ctx.authCtx.role) && !await isEventEditable(eventId)) {
            return NextResponse.json({ error: 'Event has occurred and is read-only.' }, { status: 403 })
        }

        const { reportText } = await request.json()
        if (typeof reportText !== 'string') {
            return NextResponse.json({ error: 'reportText must be a string' }, { status: 400 })
        }

        const record = await prisma.attendeeEventReport.upsert({
            where: { eventId_attendeeId: { eventId, attendeeId } },
            create: { eventId, attendeeId, reportText },
            update: { reportText }
        })

        return NextResponse.json(record)
    } catch (error) {
        console.error('Error saving attendee report:', error)
        return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
    }
}, { requireAuth: true })

const DELETEHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const eventId = await resolveEventId(rawId)
        if (!eventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

        const attendeeId = new URL(request.url).searchParams.get('attendeeId')
        if (!attendeeId) return NextResponse.json({ error: 'attendeeId is required' }, { status: 400 })

        // Allow write-role users OR the attendee themselves
        const attendeeRecord = await prisma.attendee.findUnique({ where: { id: attendeeId }, select: { email: true } })
        if (!await isOwnerOrCanWrite(ctx.authCtx, attendeeRecord?.email ?? null)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Enforce event lock for write-role users; attendees can delete their own report post-event
        if (hasWriteAccess(ctx.authCtx.role) && !await isEventEditable(eventId)) {
            return NextResponse.json({ error: 'Event has occurred and is read-only.' }, { status: 403 })
        }

        await prisma.attendeeEventReport.deleteMany({ where: { eventId, attendeeId } })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting attendee report:', error)
        return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 })
    }
}, { requireAuth: true })

export const GET = GETHandler as any
export const PUT = PUTHandler as any
export const DELETE = DELETEHandler as any
