import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { resolveEventId } from '@/lib/events'
import { geocodeAddress } from '@/lib/geocoding'
import { sanitizeSlug } from '@/lib/slug'

export const dynamic = 'force-dynamic'

const GETHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
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
}, { requireEventAccess: true })

const PATCHHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }
        const json = await request.json()

        // Validation: Name is mandatory if provided
        if (json.name !== undefined && (!json.name || json.name.trim() === '')) {
            return NextResponse.json({ error: 'Event name is required' }, { status: 400 })
        }

        // Validation: Slug is mandatory if provided; sanitize and reject if result is empty
        if (json.slug !== undefined) {
            if (!json.slug || json.slug.trim() === '') {
                return NextResponse.json({ error: 'URL Slug is required' }, { status: 400 })
            }
            json.slug = sanitizeSlug(json.slug)
            if (!json.slug) {
                return NextResponse.json({ error: 'URL Slug contains no valid characters' }, { status: 400 })
            }
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

        if (json.address) {
            const geo = await geocodeAddress(json.address)
            if (geo) {
                (json as any).latitude = geo.latitude;
                (json as any).longitude = geo.longitude;
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
                address: json.address,
                region: json.region,
                url: json.url,
                budget: json.budget !== undefined && json.budget !== null ? parseFloat(json.budget) : undefined,
                targetCustomers: json.targetCustomers,
                requesterEmail: json.requesterEmail,
                tags: json.tags,
                meetingTypes: json.meetingTypes,
                attendeeTypes: json.attendeeTypes,
                authorizedUserIds: json.authorizedUserIds,
                timezone: json.timezone,
                password: json.password,
                description: json.description,
                latitude: (json as any).latitude,
                longitude: (json as any).longitude,
                boothLocation: json.boothLocation
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
}, { requireRole: 'manageEvents' })

const DELETEHandler = withAuth(async (request, ctx) => {
    try {
        const id = (await ctx.params).id

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
}, { requireRole: 'manageEvents' })

export const GET = GETHandler as any
export const PATCH = PATCHHandler as any
export const DELETE = DELETEHandler as any
