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
import { WebhookPayloadSchema } from '@/lib/intelligence-schema'
import { sendPlainEmail } from '@/lib/email'
import { Roles } from '@/lib/constants'
import { signReportToken } from '@/lib/action-tokens'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function validateSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET_KEY
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === secret && token.length > 0
}

export async function POST(req: Request) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawPayload: unknown
  try {
    rawPayload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = WebhookPayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Schema validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const payload = parsed.data
  const { runId, updatedTargets } = payload

  // Subscriber slicing for chunked digest delivery. The dispatcher loops
  // over slices to stay under the 300s function timeout when the subscriber
  // list is large. Without these params behavior is unchanged: process all
  // subscribers, send the aggregate report, return.
  const url = new URL(req.url)
  const sliceRequested =
    url.searchParams.get('subscriberOffset') !== null ||
    url.searchParams.get('subscriberLimit') !== null
  const subscriberOffset = Math.max(0, parseInt(url.searchParams.get('subscriberOffset') ?? '0', 10) || 0)
  const subscriberLimit = (() => {
    const raw = parseInt(url.searchParams.get('subscriberLimit') ?? '', 10)
    if (!Number.isFinite(raw) || raw <= 0) return Number.MAX_SAFE_INTEGER
    return Math.min(raw, 500)
  })()

  // 1. Upsert reports — idempotent on runId+targetName
  try {
    for (const target of updatedTargets) {
      await prisma.intelligenceReport.upsert({
        where: { runId_targetName: { runId, targetName: target.name } },
        update: {
          summary: target.summary,
          salesAngle: target.salesAngle,
          fullReport: target.fullReport,
          recommendedAction: target.recommendedAction,
        },
        create: {
          runId,
          targetType: target.type,
          targetName: target.name,
          summary: target.summary,
          salesAngle: target.salesAngle,
          fullReport: target.fullReport,
          recommendedAction: target.recommendedAction,
        },
      })
    }
  } catch (err) {
    console.error('[intel-report] Failed to upsert reports:', err)
    return NextResponse.json({ error: 'Failed to store reports' }, { status: 500 })
  }

  if (payload.silent) {
    return NextResponse.json({ status: 'ok', note: 'Silent run, skipped emails' })
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

  // 4. Process each active subscriber (sliced when subscriberOffset/Limit set).
  // Stable ordering on a unique column (id) so chunked invocations cover the
  // full set without overlap or gaps.
  const totalSubscribers = await prisma.intelligenceSubscription.count({
    where: { active: true },
  })
  const subscribers = await prisma.intelligenceSubscription.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
    skip: subscriberOffset,
    take: subscriberLimit === Number.MAX_SAFE_INTEGER ? undefined : subscriberLimit,
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

  // Idempotency: skip subscribers already emailed for this runId.
  const alreadySentLogs = subscribers.length > 0
    ? await prisma.intelligenceEmailLog.findMany({
        where: {
          runId,
          userId: { in: subscribers.map(s => s.userId) },
          status: { in: ['sent', 'skipped'] },
        },
        select: { userId: true, status: true },
      })
    : []
  const alreadyHandled = new Set(alreadySentLogs.map(l => l.userId))

  let emailsSent = 0
  let emailsSkippedAlreadySent = 0
  const runDate = runId.replace('-cron', '')

  for (const subscriber of subscribers) {
    if (alreadyHandled.has(subscriber.userId)) {
      emailsSkippedAlreadySent++
      continue
    }
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

      // Build a map of every entity this subscriber tracks for DB fallback use
      const subscribedEntityMap = new Map<string, {
        type: TargetUpdate['type']
        originalName: string
        highlighted?: boolean
        linkedEventName?: string
      }>()
      for (const c of directCompanies) {
        subscribedEntityMap.set(c.name.toLowerCase(), { type: 'company', originalName: c.name, highlighted: true })
      }
      for (const a of directAttendees) {
        subscribedEntityMap.set(a.name.toLowerCase(), { type: 'attendee', originalName: a.name, highlighted: true })
      }
      for (const subEvent of subscriber.selectedEvents) {
        const eventKey = subEvent.event.name.toLowerCase()
        if (!subscribedEntityMap.has(eventKey)) {
          subscribedEntityMap.set(eventKey, { type: 'event', originalName: subEvent.event.name, linkedEventName: subEvent.event.name })
        }
        for (const att of subEvent.event.attendees) {
          const attKey = att.name.toLowerCase()
          const isHighlightedAtt = directAttendeeNames.has(attKey)
          if (!subscribedEntityMap.has(attKey)) {
            subscribedEntityMap.set(attKey, {
              type: 'attendee',
              originalName: att.name,
              highlighted: isHighlightedAtt || undefined,
              linkedEventName: isHighlightedAtt ? undefined : subEvent.event.name,
            })
          }
          const coKey = att.company?.name?.toLowerCase() ?? ''
          if (coKey && !subscribedEntityMap.has(coKey)) {
            const isHighlightedCo = directCompanyNames.has(coKey)
            subscribedEntityMap.set(coKey, {
              type: 'company',
              originalName: att.company!.name,
              highlighted: isHighlightedCo || undefined,
              linkedEventName: isHighlightedCo ? undefined : subEvent.event.name,
            })
          }
        }
      }

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

      // Fallback: fetch existing DB intelligence for subscribed entities not covered by this run
      const alreadyMatchedKeysFinal = new Set(matched.map(t => t.name.toLowerCase()))
      const missingEntities = [...subscribedEntityMap.entries()].filter(([key]) => !alreadyMatchedKeysFinal.has(key))
      if (missingEntities.length > 0) {
        const missingNames = missingEntities.map(([, meta]) => meta.originalName)
        const existingReports = await prisma.intelligenceReport.findMany({
          where: { targetName: { in: missingNames } },
          orderBy: { createdAt: 'desc' },
          distinct: ['targetName'],
        })
        const existingMap = new Map(existingReports.map(r => [r.targetName.toLowerCase(), r]))
        for (const [key, meta] of missingEntities) {
          const report = existingMap.get(key)
          if (report) {
            matched.push({
              type: report.targetType as TargetUpdate['type'],
              name: report.targetName,
              summary: report.summary,
              salesAngle: report.salesAngle,
              fullReport: report.fullReport,
              recommendedAction: report.recommendedAction ?? undefined,
              highlighted: meta.highlighted,
              linkedEventName: meta.linkedEventName,
            })
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

      const appUrl = process.env.CRON_EVENT_PLANNER_DNS ?? 'http://localhost:3000'
      const reportToken = signReportToken(subscriber.userId, subscriber.email)
      const { subject, html } = await composeIntelligenceEmail(
        recipientName,
        subscriber.email,
        subscriber.unsubscribeToken,
        matched,
        upcomingEvents,
        appUrl,
        reportToken
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

  // 5. Aggregate report for root/marketing users (only when there is genuinely new intelligence).
  // Run on the FIRST slice only (or when the caller did not slice at all) so
  // chunked dispatcher loops do not duplicate the aggregate email.
  const isFirstOrUnsliced = !sliceRequested || subscriberOffset === 0
  let aggregateSent = 0
  if (isFirstOrUnsliced && updatedTargets.length > 0 && process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
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
          const appUrl = process.env.CRON_EVENT_PLANNER_DNS ?? 'http://localhost:3000'
          const aggregateReportToken = signReportToken(u.id, email)
          const { subject, html } = await composeAggregateEmail(firstName, updatedTargets, upcomingEvents, runDate, appUrl, aggregateReportToken)
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

  const consumed = subscriberOffset + subscribers.length
  const nextOffset = consumed >= totalSubscribers ? -1 : consumed
  return NextResponse.json({
    status: 'ok',
    emailsSent,
    aggregateSent,
    emailsSkippedAlreadySent,
    subscriberOffset,
    subscribersInSlice: subscribers.length,
    nextOffset,
    total: totalSubscribers,
  })
}
