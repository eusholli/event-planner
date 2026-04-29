import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { resolveEventId } from '@/lib/events'

export const dynamic = 'force-dynamic'

async function getHandler(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('query')
        const rawEventId = searchParams.get('eventId')

        if (rawEventId) {
            const eventId = await resolveEventId(rawEventId)
            if (!eventId) {
                return NextResponse.json({ error: 'Event not found' }, { status: 404 })
            }

            const companies = await prisma.company.findMany({
                where: {
                    attendees: {
                        some: {
                            events: { some: { id: eventId } }
                        }
                    }
                },
                orderBy: { name: 'asc' },
                include: {
                    _count: {
                        select: {
                            attendees: {
                                where: { events: { some: { id: eventId } } }
                            }
                        }
                    }
                }
            })

            return NextResponse.json(companies)
        }

        const where = query
            ? { name: { contains: query, mode: 'insensitive' as const } }
            : {}

        const companies = await prisma.company.findMany({
            where,
            orderBy: { name: 'asc' },
            include: {
                _count: { select: { attendees: true } }
            }
        })

        return NextResponse.json(companies)
    } catch (error) {
        console.error('Error fetching companies:', error)
        return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 })
    }
}

async function postHandler(request: Request) {
    try {
        const json = await request.json()
        const { name, description, pipelineValue } = json

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
        }

        // Check for existing company with same name (case-insensitive)
        const existing = await prisma.company.findFirst({
            where: {
                name: {
                    equals: name.trim(),
                    mode: 'insensitive'
                }
            }
        })

        if (existing) {
            return NextResponse.json({ error: 'A company with this name already exists' }, { status: 409 })
        }

        const company = await prisma.company.create({
            data: {
                name: name.trim(),
                description: description || null,
                pipelineValue: pipelineValue ? parseFloat(pipelineValue) : null,
            },
            include: {
                _count: { select: { attendees: true } }
            }
        })

        return NextResponse.json(company)
    } catch (error) {
        console.error('Error creating company:', error)
        return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
    }
}

export const GET = withAuth(getHandler, { requireAuth: true }) as any
export const POST = withAuth(postHandler, { requireAuth: true }) as any
