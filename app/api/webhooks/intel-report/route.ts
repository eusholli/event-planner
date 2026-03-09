// app/api/webhooks/intel-report/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { composeIntelligenceEmail, type TargetUpdate, type UpcomingEvent } from '@/lib/intelligence-email'
import { sendPlainEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function validateSecret(req: Request): boolean {
  const secret = process.env.INTELLIGENCE_SECRET_KEY
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === secret && token.length > 0
}

type WebhookPayload = {
  runId: string
  timestamp: string
  updatedTargets: TargetUpdate[]
}

export async function POST(req: Request) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { runId, updatedTargets } = payload
  if (!runId) {
    return NextResponse.json({ error: 'runId required' }, { status: 400 })
  }
  if (!Array.isArray(updatedTargets)) {
    return NextResponse.json({ error: 'updatedTargets must be an array' }, { status: 400 })
  }

  // 1. Upsert reports — idempotent on runId+targetName
  try {
    for (const target of updatedTargets) {
      console.log(`[intel-report] Upserting target: ${target.name} (${target.type})`)
      await prisma.intelligenceReport.upsert({
        where: { runId_targetName: { runId, targetName: target.name } },
        update: {
          summary: target.summary,
          salesAngle: target.salesAngle,
          fullReport: target.fullReport,
        },
        create: {
          runId,
          targetType: target.type,
          targetName: target.name,
          summary: target.summary,
          salesAngle: target.salesAngle,
          fullReport: target.fullReport,
        },
      })
      console.log(`[intel-report] Upserted target: ${target.name}`)
    }
  } catch (err) {
    console.error('[intel-report] Failed to upsert reports:', err)
    return NextResponse.json({ error: 'Failed to store reports' }, { status: 500 })
  }

  // 2. If no updated targets, return early
  if (updatedTargets.length === 0) {
    console.log(`Intelligence run ${runId}: no updated targets, skipping email dispatch`)
    return NextResponse.json({ status: 'ok', emailsSent: 0 })
  }

  // 3. Fetch upcoming events (same for all subscribers)
  let upcomingEvents: UpcomingEvent[]
  try {
    const now = new Date()
    const thirtyDaysOut = new Date(now)
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
    const upcomingEventRecords = await prisma.event.findMany({
      where: {
        startDate: { gte: now, lte: thirtyDaysOut },
        status: { not: 'CANCELED' },
      },
      orderBy: { startDate: 'asc' },
      select: { name: true, startDate: true, endDate: true, status: true },
    })
    upcomingEvents = upcomingEventRecords.map((e) => ({
      name: e.name,
      startDate: e.startDate?.toISOString().split('T')[0] ?? null,
      endDate: e.endDate?.toISOString().split('T')[0] ?? null,
      status: e.status,
    }))
    console.log(`[intel-report] Fetched ${upcomingEvents.length} upcoming events`)
  } catch (err) {
    console.error('[intel-report] Failed to fetch upcoming events:', err)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }

  // 4. Build target lookup: lowercase name → target
  const targetMap = new Map<string, TargetUpdate>()
  for (const t of updatedTargets) {
    targetMap.set(t.name.toLowerCase(), t)
  }

  // 5. Process each active subscriber
  let subscribers: Awaited<ReturnType<typeof prisma.intelligenceSubscription.findMany>>
  try {
    subscribers = await prisma.intelligenceSubscription.findMany({
      where: { active: true },
    })
    console.log(`[intel-report] Found ${subscribers.length} active subscribers`)
  } catch (err) {
    console.error('[intel-report] Failed to fetch subscribers:', err)
    return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 })
  }

  let emailsSent = 0

  for (const subscriber of subscribers) {
    try {
      const attendee = await prisma.attendee.findUnique({
        where: { email: subscriber.email },
        select: { id: true, name: true },
      })

      if (!attendee) {
        await prisma.intelligenceEmailLog.create({
          data: { runId, userId: subscriber.userId, email: subscriber.email, targetCount: 0, status: 'skipped' },
        })
        continue
      }

      // Get all meetings this person attended and their fellow attendees
      const meetings = await prisma.meeting.findMany({
        where: { attendees: { some: { id: attendee.id } } },
        select: {
          attendees: {
            select: { name: true, company: { select: { name: true } } },
          },
        },
      })

      // Collect unique company and attendee names from their meetings (excluding self)
      const companyNames = new Set<string>()
      const attendeeNames = new Set<string>()
      for (const meeting of meetings) {
        for (const a of meeting.attendees) {
          if (a.name !== attendee.name) {
            attendeeNames.add(a.name.toLowerCase())
            companyNames.add(a.company.name.toLowerCase())
          }
        }
      }

      // Match against updated targets
      const matched: TargetUpdate[] = []
      for (const [key, target] of targetMap.entries()) {
        if (target.type === 'company' && companyNames.has(key)) {
          matched.push(target)
        } else if (target.type === 'attendee' && attendeeNames.has(key)) {
          matched.push(target)
        }
      }

      if (matched.length === 0) {
        await prisma.intelligenceEmailLog.create({
          data: { runId, userId: subscriber.userId, email: subscriber.email, targetCount: 0, status: 'skipped' },
        })
        continue
      }

      const { subject, html } = await composeIntelligenceEmail(attendee.name, subscriber.email, subscriber.unsubscribeToken, matched, upcomingEvents)
      await sendPlainEmail(subscriber.email, subject, html)

      await prisma.intelligenceEmailLog.create({
        data: { runId, userId: subscriber.userId, email: subscriber.email, targetCount: matched.length, status: 'sent' },
      })
      emailsSent++
    } catch (err) {
      console.error(`Failed to process subscriber ${subscriber.email}:`, err)
      await prisma.intelligenceEmailLog.create({
        data: { runId, userId: subscriber.userId, email: subscriber.email, targetCount: 0, status: 'failed' },
      })
    }
  }

  return NextResponse.json({ status: 'ok', emailsSent })
}
