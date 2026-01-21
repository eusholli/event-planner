import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { isRootUser, canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const { sessionClaims } = await auth()
        // If auth disabled, assume root
        const role = process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true'
            ? 'root'
            : sessionClaims?.metadata?.role as string

        const isPrivileged = role === 'root' || role === 'admin'

        // Users see only COMMITTED events. Root/Admin see all.
        const where = isPrivileged ? {} : { status: 'COMMITTED' }

        const events = await prisma.event.findMany({
            where,
            orderBy: {
                startDate: 'desc'
            }
        })
        return NextResponse.json(events)
    } catch (error) {
        console.error('Error fetching events:', error)
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        // Only Root/Admin can create events
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }


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

        const event = await prisma.event.create({
            data: {
                name: json.name ?? 'New Event',
                slug: slug,
                startDate: json.startDate,
                endDate: json.endDate,
                status: json.status || 'PIPELINE',
                region: json.region,
                url: json.url,
                budget: json.budget ? parseFloat(json.budget) : undefined,
                targetCustomers: json.targetCustomers,
                expectedRoi: json.expectedRoi,
                requesterEmail: json.requesterEmail,
                tags: json.tags || defaultTags,
                meetingTypes: json.meetingTypes || defaultMeetingTypes,
                attendeeTypes: json.attendeeTypes || defaultAttendeeTypes,
                timezone: json.timezone
            }
        })


        return NextResponse.json(event)
    } catch (error) {
        console.error('Error creating event:', error)
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }
}
