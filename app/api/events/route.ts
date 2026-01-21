import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { isRootUser, canManageEvents } from '@/lib/roles'

import { Roles } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const { sessionClaims, userId } = await auth()
        // If auth disabled, assume root
        const role = process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true'
            ? Roles.Root
            : sessionClaims?.metadata?.role as string

        const isGlobalAccess = role === Roles.Root || role === Roles.Marketing

        const where: any = {}

        if (!isGlobalAccess) {
            // If local auth is mocked or no user, this might be tricky with "has"
            // But assuming Clerk is active or Root bypass matches above.
            if (!userId && process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }

            // If not global access (Admin or User), they must be in the authorized list
            if (userId) {
                where.authorizedUserIds = { has: userId }
            }
        }

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
        // Only Root/Marketing can create events
        if (!await canManageEvents()) {
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
                authorizedUserIds: json.authorizedUserIds || [],
                timezone: json.timezone,
                password: json.password
            }
        })


        return NextResponse.json(event)
    } catch (error) {
        console.error('Error creating event:', error)
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }
}
