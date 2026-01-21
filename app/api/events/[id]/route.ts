import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canWrite, isRootUser } from '@/lib/roles'
import { resolveEventId } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const rawId = (await params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const event = await prisma.event.findUnique({
            where: { id }
        })

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const response = {
            ...event,
            startDate: event.startDate ? event.startDate.toISOString().split('T')[0] : null,
            endDate: event.endDate ? event.endDate.toISOString().split('T')[0] : null
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('Error fetching event:', error)
        return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 })
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const rawId = (await params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }
        const json = await request.json()

        // Validation: Name is mandatory if provided
        if (json.name !== undefined && (!json.name || json.name.trim() === '')) {
            return NextResponse.json({ error: 'Event name is required' }, { status: 400 })
        }

        // Validation: Slug is mandatory if provided
        if (json.slug !== undefined && (!json.slug || json.slug.trim() === '')) {
            return NextResponse.json({ error: 'URL Slug is required' }, { status: 400 })
        }

        // Validation: Unique Name
        if (json.name) {
            const existing = await prisma.event.findFirst({
                where: {
                    name: {
                        equals: json.name,
                        mode: 'insensitive'
                    },
                    id: {
                        not: id
                    }
                }
            })
            if (existing) {
                return NextResponse.json({ error: 'Event name must be unique' }, { status: 409 })
            }
        }

        // Validation: Unique Slug
        if (json.slug) {
            const existingSlug = await prisma.event.findUnique({
                where: { slug: json.slug }
            })
            if (existingSlug && existingSlug.id !== id) {
                return NextResponse.json({ error: 'Event slug must be unique' }, { status: 409 })
            }
        }

        // Fetch current event to check constraints against combined state
        const currentEvent = await prisma.event.findUnique({ where: { id } })
        if (!currentEvent) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        // LOCK CHECK: If event is currently OCCURRED, block changes unless we are strictly changing status AWAY from OCCURRED
        if (currentEvent.status === 'OCCURRED') {
            // Check if user is attempting to unlock (change status to something else)
            const isUnlocking = json.status && json.status !== 'OCCURRED';

            if (!isUnlocking) {
                return NextResponse.json({
                    error: 'Event has occurred and is read-only. Change status to edit.'
                }, { status: 403 })
            }
            // If unlocking, we allow the update to proceed (which will update the status)
        }

        // Calculate final state for validation
        const finalStatus = json.status !== undefined ? json.status : currentEvent.status
        const finalStartDate = json.startDate !== undefined ? json.startDate : currentEvent.startDate
        const finalEndDate = json.endDate !== undefined ? json.endDate : currentEvent.endDate
        const finalAddress = json.address !== undefined ? json.address : currentEvent.address

        if (finalStatus === 'COMMITTED') {
            if (!finalStartDate || !finalEndDate || !finalAddress || finalAddress.trim() === '') {
                return NextResponse.json({
                    error: 'Committed events must have Start Date, End Date, and Address'
                }, { status: 400 })
            }
        }

        const event = await prisma.event.update({
            where: { id },
            data: {
                name: json.name,
                slug: json.slug,
                startDate: json.startDate ? new Date(json.startDate) : json.startDate,
                endDate: json.endDate ? new Date(json.endDate) : json.endDate,
                status: json.status,
                address: json.address, // Added missing address field
                region: json.region,
                url: json.url,
                budget: json.budget !== undefined && json.budget !== null ? parseFloat(json.budget) : undefined, // Fix 0 being treated as false
                targetCustomers: json.targetCustomers,
                expectedRoi: json.expectedRoi,
                requesterEmail: json.requesterEmail,
                tags: json.tags,
                meetingTypes: json.meetingTypes,
                attendeeTypes: json.attendeeTypes,
                timezone: json.timezone
            }
        })

        const response = {
            ...event,
            startDate: event.startDate ? event.startDate.toISOString().split('T')[0] : null,
            endDate: event.endDate ? event.endDate.toISOString().split('T')[0] : null
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('Error updating event:', error)
        return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Only Root can delete events? Or Admin too?
        // Plan said: Root/Admin can Delete Events.
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const id = (await params).id

        // Check if event exists
        const existing = await prisma.event.findUnique({ where: { id } })
        if (!existing) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        // LOCK CHECK
        if (existing.status === 'OCCURRED') {
            return NextResponse.json({
                error: 'Cannot delete an event that has occurred.'
            }, { status: 403 })
        }

        // Delete cascade handles children (defined in schema)
        await prisma.event.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting event:', error)
        return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
    }
}
