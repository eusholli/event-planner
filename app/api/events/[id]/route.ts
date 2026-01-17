import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canWrite, isRootUser } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = (await params).id
        const event = await prisma.event.findUnique({
            where: { id }
        })

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        return NextResponse.json(event)
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

        const id = (await params).id
        const json = await request.json()

        const event = await prisma.event.update({
            where: { id },
            data: {
                name: json.name,
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

        return NextResponse.json(event)
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
