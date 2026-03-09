// app/api/intelligence/targets/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function validateSecret(req: Request): boolean {
  const secret = process.env.INTELLIGENCE_SECRET_KEY
  if (!secret) return false // reject if env var not configured
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === secret && token.length > 0
}

export async function GET(req: Request) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setDate(windowStart.getDate() - 90)
  const windowEnd = new Date(now)
  windowEnd.setDate(windowEnd.getDate() + 60)
  const thirtyDaysOut = new Date(now)
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)

  // Events with startDate in the [-90, +60] window
  const windowEvents = await prisma.event.findMany({
    where: {
      startDate: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true },
  })
  const windowEventIds = windowEvents.map((e) => e.id)

  // Companies: linked to meetings in those events, sorted by pipelineValue
  const companies = await prisma.company.findMany({
    where: {
      attendees: {
        some: {
          meetings: {
            some: { eventId: { in: windowEventIds } },
          },
        },
      },
    },
    orderBy: { pipelineValue: 'desc' },
    take: 20,
    select: {
      name: true,
      pipelineValue: true,
      attendees: {
        select: {
          _count: { select: { meetings: { where: { eventId: { in: windowEventIds } } } } },
        },
      },
    },
  })

  const upcomingEvents30 = await prisma.event.findMany({
    where: {
      startDate: { gte: now, lte: thirtyDaysOut },
      status: { not: 'CANCELED' },
    },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
    orderBy: { startDate: 'asc' },
  })

  // Attendees: C-Level or VP with meetings in window
  const attendees = await prisma.attendee.findMany({
    where: {
      seniorityLevel: { in: ['C-Level', 'VP'] },
      meetings: {
        some: { eventId: { in: windowEventIds } },
      },
    },
    take: 20,
    select: {
      name: true,
      title: true,
      seniorityLevel: true,
      company: { select: { name: true } },
      _count: { select: { meetings: { where: { eventId: { in: windowEventIds } } } } },
    },
  })

  return NextResponse.json({
    generatedAt: now.toISOString(),
    companies: companies.map((c) => ({
      name: c.name,
      pipelineValue: c.pipelineValue ?? 0,
      upcomingMeetings: c.attendees.reduce((sum, a) => sum + a._count.meetings, 0),
    })),
    attendees: attendees.map((a) => ({
      name: a.name,
      title: a.title,
      company: a.company.name,
      seniorityLevel: a.seniorityLevel,
      upcomingMeetings: a._count.meetings,
    })),
    upcomingEvents: upcomingEvents30.map((e) => ({
      name: e.name,
      startDate: e.startDate?.toISOString().split('T')[0] ?? null,
      endDate: e.endDate?.toISOString().split('T')[0] ?? null,
      status: e.status,
    })),
  })
  } catch (err) {
    console.error('Intelligence targets error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
