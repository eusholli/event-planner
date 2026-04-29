import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, AuthContext } from '@/lib/with-auth'
import { geocodeAddress } from '@/lib/geocoding'

export const dynamic = 'force-dynamic'

const GETHandler = withAuth(async (request, ctx) => {
    try {
        const where: any = {}

        const events = await prisma.event.findMany({
            where,
            orderBy: {
                startDate: 'asc'
            }
        })
        return NextResponse.json(events)
    } catch (error) {
        console.error('Error fetching events:', error)
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }
}, { requireAuth: true })

const POSTHandler = withAuth(async (request, ctx) => {
    try {
        const json = await request.json()

        let slug = json.slug

        if (slug && slug.trim() !== '') {
            // Check provided slug uniqueness
            const existingSlug = await prisma.event.findUnique({
                where: { slug }
            })
            if (existingSlug) {
                return NextResponse.json({ error: 'Event slug must be unique' }, { status: 409 })
            }
        } else {
            // Generate draft slug
            const randomSuffix = Math.random().toString(36).substring(2, 8)
            slug = `draft-event-${Date.now()}-${randomSuffix}`
        }

        // Fetch system settings for defaults
        const settings = await prisma.systemSettings.findFirst()
        const defaultTags = settings?.defaultTags || []
        const defaultMeetingTypes = settings?.defaultMeetingTypes || []
        const defaultAttendeeTypes = settings?.defaultAttendeeTypes || []

        let eventName = json.name?.trim()
        if (!eventName) {
            eventName = 'New Event'
            const existing = await prisma.event.findMany({
                where: { name: { startsWith: 'New Event' } },
                select: { name: true }
            })
            if (existing.some(e => e.name === eventName)) {
                const nums = existing
                    .map(e => { const m = e.name.match(/^New Event(?: (\d+))?$/); return m ? (m[1] ? parseInt(m[1]) : 1) : 0 })
                    .filter(n => n > 0)
                const next = nums.length ? Math.max(...nums) + 1 : 2
                eventName = `New Event ${next}`
            }
        }

        let latitude = null
        let longitude = null
        if (json.address) {
            try {
                const geo = await geocodeAddress(json.address)
                if (geo) {
                    latitude = geo.latitude
                    longitude = geo.longitude
                }
            } catch (e) {
                console.error('Geocoding failed:', e)
            }
        }

        const event = await prisma.event.create({
            data: {
                name: eventName,
                slug: slug,
                startDate: json.startDate,
                endDate: json.endDate,
                status: json.status || 'PIPELINE',
                region: json.region,
                url: json.url,
                budget: json.budget ? parseFloat(json.budget) : undefined,
                targetCustomers: json.targetCustomers,
                requesterEmail: json.requesterEmail,
                tags: json.tags || defaultTags,
                meetingTypes: json.meetingTypes || defaultMeetingTypes,
                attendeeTypes: json.attendeeTypes || defaultAttendeeTypes,
                authorizedUserIds: json.authorizedUserIds || [],
                timezone: json.timezone,
                password: json.password,
                address: json.address,
                latitude,
                longitude,
                boothLocation: json.boothLocation
            }
        })

        return NextResponse.json(event)
    } catch (error) {
        console.error('Error creating event:', error)
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }
}, { requireRole: 'manageEvents' })

export const GET = GETHandler as any
export const POST = POSTHandler as any
