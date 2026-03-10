// app/api/intelligence/targets/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function validateSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET_KEY
  if (!secret) return false
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

    const companies = await prisma.company.findMany({
      where: { subscriptionCount: { gt: 0 } },
      orderBy: { subscriptionCount: 'desc' },
      select: { name: true, pipelineValue: true, subscriptionCount: true },
    })

    const attendees = await prisma.attendee.findMany({
      where: { subscriptionCount: { gt: 0 } },
      orderBy: { subscriptionCount: 'desc' },
      select: {
        name: true,
        title: true,
        seniorityLevel: true,
        subscriptionCount: true,
        company: { select: { name: true } },
      },
    })

    const events = await prisma.event.findMany({
      where: { subscriptionCount: { gt: 0 } },
      orderBy: { subscriptionCount: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        subscriptionCount: true,
        attendees: {
          select: {
            name: true,
            title: true,
            company: { select: { name: true } },
          },
        },
      },
    })

    return NextResponse.json({
      generatedAt: now.toISOString(),
      companies: companies.map(c => ({
        name: c.name,
        pipelineValue: c.pipelineValue ?? 0,
        subscriptionCount: c.subscriptionCount,
      })),
      attendees: attendees.map(a => ({
        name: a.name,
        title: a.title,
        company: a.company.name,
        seniorityLevel: a.seniorityLevel,
        subscriptionCount: a.subscriptionCount,
      })),
      events: events.map(e => ({
        name: e.name,
        startDate: e.startDate?.toISOString().split('T')[0] ?? null,
        endDate: e.endDate?.toISOString().split('T')[0] ?? null,
        status: e.status,
        subscriptionCount: e.subscriptionCount,
        linkedAttendees: e.attendees.map(a => ({ name: a.name, title: a.title, company: a.company.name })),
      })),
    })
  } catch (err) {
    console.error('Intelligence targets error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
