// app/api/webhooks/intel-report/route.ts
import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import {
  composeIntelligenceEmail,
  composeAggregateEmail,
  type TargetUpdate,
  type UpcomingEvent,
} from '@/lib/intelligence-email'
import { sendPlainEmail } from '@/lib/email'
import { Roles } from '@/lib/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function validateSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET_KEY
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
      await prisma.intelligenceReport.upsert({
        where: { runId_targetName: { runId, targetName: target.name } },
        update: { summary: target.summary, salesAngle: target.salesAngle, fullReport: target.fullReport },
        create: {
          runId,
          targetType: target.type,
          targetName: target.name,
          summary: target.summary,
          salesAngle: target.salesAngle,
          fullReport: target.fullReport,
        },
      })
    }
  } catch (err) {
    console.error('[intel-report] Failed to upsert reports:', err)
    return NextResponse.json({ error: 'Failed to store reports' }, { status: 500 })
  }

  if (updatedTargets.length === 0) {
    console.log(`Intelligence run ${runId}: no updated targets, skipping email dispatch`)
    return NextResponse.json({ status: 'ok', emailsSent: 0 })
  }

  // 2. Fetch upcoming events (shared for all emails)
  let upcomingEvents: UpcomingEvent[]
  try {
    const now = new Date()
    const thirtyDaysOut = new Date(now)
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
    const records = await prisma.event.findMany({
      where: { startDate: { gte: now, lte: thirtyDaysOut }, status: { not: 'CANCELED' } },
      orderBy: { startDate: 'asc' },
      select: { name: true, startDate: true, endDate: true, status: true },
    })
    upcomingEvents = records.map(e => ({
      name: e.name,
      startDate: e.startDate?.toISOString().split('T')[0] ?? null,
      endDate: e.endDate?.toISOString().split('T')[0] ?? null,
      status: e.status,
    }))
  } catch (err) {
    console.error('[intel-report] Failed to fetch upcoming events:', err)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }

  // 3. Build target lookup (case-insensitive)
  const targetMap = new Map<string, TargetUpdate>()
  for (const t of updatedTargets) {
    targetMap.set(t.name.toLowerCase(), t)
  }

  // 4. Process each active subscriber
  const subscribers = await prisma.intelligenceSubscription.findMany({
    where: { active: true },
    include: {
      selectedAttendees: { select: { attendeeId: true } },
      selectedCompanies: { select: { companyId: true } },
      selectedEvents: {
        select: {
          eventId: true,
          event: {
            select: {
              name: true,
              attendees: { select: { name: true, company: { select: { name: true } } } },
            },
          },
        },
      },
    },
  })

  let emailsSent = 0
  const runDate = runId.replace('-cron', '')

  for (const subscriber of subscribers) {
    try {
      // Direct selections: entity IDs → look up names
      const directAttendeeIds = subscriber.selectedAttendees.map(r => r.attendeeId)
      const directCompanyIds = subscriber.selectedCompanies.map(r => r.companyId)

      // Load names for direct attendee/company selections
      const directAttendees = directAttendeeIds.length > 0
        ? await prisma.attendee.findMany({
          where: { id: { in: directAttendeeIds } },
          select: { id: true, name: true },
        })
        : []
      const directCompanies = directCompanyIds.length > 0
        ? await prisma.company.findMany({
          where: { id: { in: directCompanyIds } },
          select: { id: true, name: true },
        })
        : []

      const directAttendeeNames = new Set(directAttendees.map(a => a.name.toLowerCase()))
      const directCompanyNames = new Set(directCompanies.map(c => c.name.toLowerCase()))

      const matched: TargetUpdate[] = []

      // Match directly selected entities (highlighted)
      for (const [key, target] of targetMap.entries()) {
        if (target.type === 'attendee' && directAttendeeNames.has(key)) {
          matched.push({ ...target, highlighted: true })
        } else if (target.type === 'company' && directCompanyNames.has(key)) {
          matched.push({ ...target, highlighted: true })
        }
      }

      // Match via subscribed events (event-linked, not highlighted unless also direct)
      const alreadyMatchedKeys = new Set(matched.map(t => t.name.toLowerCase()))

      for (const subEvent of subscriber.selectedEvents) {
        const eventName = subEvent.event.name

        // Check if the event itself has an update
        const eventKey = eventName.toLowerCase()
        if (targetMap.has(eventKey) && !alreadyMatchedKeys.has(eventKey)) {
          matched.push({ ...targetMap.get(eventKey)!, linkedEventName: eventName })
          alreadyMatchedKeys.add(eventKey)
        }

        // Check attendees and their companies linked to this event
        for (const att of subEvent.event.attendees) {
          const attKey = att.name.toLowerCase()
          const coKey = att.company?.name?.toLowerCase() ?? ''

          if (targetMap.has(attKey) && !alreadyMatchedKeys.has(attKey)) {
            const isHighlighted = directAttendeeNames.has(attKey)
            matched.push({ ...targetMap.get(attKey)!, highlighted: isHighlighted ? true : undefined, linkedEventName: isHighlighted ? undefined : eventName })
            alreadyMatchedKeys.add(attKey)
          }
          if (coKey && targetMap.has(coKey) && !alreadyMatchedKeys.has(coKey)) {
            const isHighlighted = directCompanyNames.has(coKey)
            matched.push({ ...targetMap.get(coKey)!, highlighted: isHighlighted ? true : undefined, linkedEventName: isHighlighted ? undefined : eventName })
            alreadyMatchedKeys.add(coKey)
          }
        }
      }

      if (matched.length === 0) {
        await prisma.intelligenceEmailLog.create({
          data: { runId, userId: subscriber.userId, email: subscriber.email, targetCount: 0, status: 'skipped' },
        })
        continue
      }

      // Resolve subscriber name from attendee record (best effort)
      const attendee = await prisma.attendee.findUnique({
        where: { email: subscriber.email },
        select: { name: true },
      })
      const recipientName = attendee?.name ?? subscriber.email

      const { subject, html } = await composeIntelligenceEmail(
        recipientName,
        subscriber.email,
        subscriber.unsubscribeToken,
        matched,
        upcomingEvents
      )
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

  // 5. Aggregate report for root/marketing users
  let aggregateSent = 0
  if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
    try {
      const client = await clerkClient()
      const allUsers = await client.users.getUserList({ limit: 500 })
      const privilegedUsers = allUsers.data.filter(u =>
        u.publicMetadata.role === Roles.Root || u.publicMetadata.role === Roles.Marketing
      )

      for (const u of privilegedUsers) {
        const email = u.emailAddresses[0]?.emailAddress
        if (!email) continue
        try {
          const firstName = u.firstName ?? u.emailAddresses[0]?.emailAddress ?? 'Team'
          const { subject, html } = await composeAggregateEmail(firstName, updatedTargets, upcomingEvents, runDate)
          await sendPlainEmail(email, subject, html)
          await prisma.intelligenceEmailLog.create({
            data: { runId, userId: u.id, email, targetCount: updatedTargets.length, status: 'aggregate' },
          })
          aggregateSent++
        } catch (err) {
          console.error(`Failed to send aggregate report to ${email}:`, err)
          await prisma.intelligenceEmailLog.create({
            data: { runId, userId: u.id, email, targetCount: 0, status: 'failed' },
          })
        }
      }
    } catch (err) {
      console.error('[intel-report] Failed to fetch Clerk users for aggregate report:', err)
      // Non-fatal: continue
    }
  }

  return NextResponse.json({ status: 'ok', emailsSent, aggregateSent })
}
