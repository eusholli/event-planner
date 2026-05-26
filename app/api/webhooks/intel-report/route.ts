// app/api/webhooks/intel-report/route.ts
import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import {
  composeIntelligenceEmail,
  composeRegionalEmail,
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

  console.log(`[intel-report] incoming runId=${runId} silent=${payload.silent} targets=${updatedTargets.length}`)

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
    console.log(`[intel-report] upserted ${updatedTargets.length} reports for runId=${runId} (silent, skipping emails)`)
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
  let emailsSkippedNoTargets = 0
  let emailsFailed = 0
  const runDate = runId.replace('-cron', '')

  console.log(`[intel-report] processing subscribers runId=${runId} total=${totalSubscribers} slice=${subscriberOffset}..${subscriberOffset + subscribers.length} alreadyHandled=${alreadyHandled.size}`)

  for (const subscriber of subscribers) {
    if (alreadyHandled.has(subscriber.userId)) {
      console.log(`[intel-report] skip userId=${subscriber.userId} email=${subscriber.email} reason=already_handled runId=${runId}`)
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
        console.log(`[intel-report] skip userId=${subscriber.userId} email=${subscriber.email} reason=no_matched_targets directSubs=${subscriber.selectedAttendees.length + subscriber.selectedCompanies.length} eventSubs=${subscriber.selectedEvents.length} runId=${runId}`)
        emailsSkippedNoTargets++
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
      console.log(`[intel-report] email sent userId=${subscriber.userId} email=${subscriber.email} matchedTargets=${matched.length} highlighted=${matched.filter(t => t.highlighted).length} eventLinked=${matched.filter(t => t.linkedEventName && !t.highlighted).length} fallback=${matched.filter(t => !t.highlighted && !t.linkedEventName).length} runId=${runId}`)
    } catch (err) {
      console.error(`Failed to process subscriber ${subscriber.email}:`, err)
      emailsFailed++
      await prisma.intelligenceEmailLog.create({
        data: { runId, userId: subscriber.userId, email: subscriber.email, targetCount: 0, status: 'failed' },
      })
    }
  }

  console.log(`[intel-report] subscriber loop done runId=${runId} sent=${emailsSent} skippedAlreadyHandled=${emailsSkippedAlreadySent} skippedNoTargets=${emailsSkippedNoTargets} failed=${emailsFailed}`)

  // 5. Regional reports (replaces the old aggregate-to-root/marketing email).
  // Runs on the FIRST slice only (or when the caller did not slice at all) so
  // chunked dispatcher loops do not duplicate emails.
  const isFirstOrUnsliced = !sliceRequested || subscriberOffset === 0
  let regionalSent = 0
  let unassignedSent = 0
  if (!isFirstOrUnsliced) {
    console.log(`[intel-report] regional dispatch skipped runId=${runId} reason=not_first_slice offset=${subscriberOffset}`)
  }
  if (isFirstOrUnsliced && updatedTargets.length > 0) {
    try {
      const appUrl = process.env.CRON_EVENT_PLANNER_DNS ?? 'http://localhost:3000'

      // 5a. Load in-scope companies (subscribed OR user-subscribed) with their region.
      const scopedCompanies = await prisma.company.findMany({
        where: { OR: [{ subscriptionCount: { gt: 0 } }, { subscribed: true }] },
        select: { name: true, region: true },
      })
      const companyRegion = new Map<string, string | null>()
      for (const c of scopedCompanies) {
        companyRegion.set(c.name.toLowerCase(), c.region)
      }

      // 5b. For attendee targets, resolve their company → region in one query.
      const attendeeNames = updatedTargets
        .filter(t => t.type === 'attendee')
        .map(t => t.name)
      const attendeeCompanyRegion = new Map<string, string | null>()
      if (attendeeNames.length > 0) {
        const attendees = await prisma.attendee.findMany({
          where: { name: { in: attendeeNames } },
          select: { name: true, company: { select: { region: true } } },
        })
        for (const a of attendees) {
          attendeeCompanyRegion.set(a.name.toLowerCase(), a.company.region)
        }
      }

      // 5c. Bucket targets by region (null/unknown → __UNASSIGNED__).
      const UNASSIGNED = '__UNASSIGNED__'
      const regionBuckets = new Map<string, TargetUpdate[]>()
      const pushBucket = (key: string, t: TargetUpdate) => {
        const arr = regionBuckets.get(key) ?? []
        arr.push(t)
        regionBuckets.set(key, arr)
      }
      for (const t of updatedTargets) {
        const key = t.name.toLowerCase()
        if (t.type === 'company') {
          if (!companyRegion.has(key)) continue // not in scope (shouldn't happen)
          const region = companyRegion.get(key)
          pushBucket(region ?? UNASSIGNED, t)
        } else if (t.type === 'attendee') {
          const region = attendeeCompanyRegion.get(key)
          if (region === undefined) continue // attendee company not resolved
          pushBucket(region ?? UNASSIGNED, t)
        }
        // events: handled below — included in every regional briefing.
      }

      const namedRegions = [...regionBuckets.keys()].filter(r => r !== UNASSIGNED)
      const unassignedCount = regionBuckets.get(UNASSIGNED)?.length ?? 0
      console.log(`[intel-report] regional dispatch start runId=${runId} regions=[${namedRegions.join(',')}] unassignedTargets=${unassignedCount}`)

      // 5d. Fetch PIPELINE/COMMITTED events in the next 3 months (shared).
      const threeMonthsOut = new Date()
      threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3)
      const pipelineEventRecords = await prisma.event.findMany({
        where: {
          status: { in: ['PIPELINE', 'COMMITTED'] },
          startDate: { gte: new Date(), lte: threeMonthsOut },
        },
        orderBy: { startDate: 'asc' },
        select: { name: true, startDate: true, endDate: true, status: true },
      })
      const pipelineEvents: UpcomingEvent[] = pipelineEventRecords.map(e => ({
        name: e.name,
        startDate: e.startDate?.toISOString().split('T')[0] ?? null,
        endDate: e.endDate?.toISOString().split('T')[0] ?? null,
        status: e.status,
      }))

      const clerkEnabled = process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true'

      // 5e. Per-region dispatch.
      const regionalRegions = [...regionBuckets.keys()].filter(r => r !== UNASSIGNED)
      for (const region of regionalRegions) {
        const targetsForRegion = regionBuckets.get(region) ?? []
        if (targetsForRegion.length === 0) continue

        const profiles = await prisma.userProfile.findMany({
          where: { regions: { has: region } },
          select: { clerkUserId: true },
        })
        const alreadyLogged = await prisma.intelligenceEmailLog.findMany({
          where: { runId, status: 'regional', region },
          select: { userId: true },
        })
        const skipUserIds = new Set(alreadyLogged.map(l => l.userId))

        console.log(`[intel-report] region=${region} targets=${targetsForRegion.length} profiles=${profiles.length} alreadyLogged=${alreadyLogged.length} runId=${runId}`)

        if (profiles.length === 0) continue
        if (!clerkEnabled) continue

        const client = await clerkClient()
        for (const profile of profiles) {
          if (skipUserIds.has(profile.clerkUserId)) {
            console.log(`[intel-report] regional email skipped region=${region} userId=${profile.clerkUserId} reason=already_logged runId=${runId}`)
            continue
          }
          let u
          try {
            u = await client.users.getUser(profile.clerkUserId)
          } catch (err) {
            console.error(`[intel-report] Failed to fetch Clerk user ${profile.clerkUserId}:`, err)
            continue
          }
          const email = u.emailAddresses[0]?.emailAddress
          if (!email) continue
          try {
            const firstName = u.firstName ?? email ?? 'Team'
            const reportToken = signReportToken(u.id, email)
            const { subject, html } = await composeRegionalEmail(
              firstName, region, targetsForRegion, pipelineEvents, runDate, appUrl, reportToken,
            )
            await sendPlainEmail(email, subject, html)
            await prisma.intelligenceEmailLog.upsert({
              where: { runId_userId_status_region: { runId, userId: u.id, status: 'regional', region } },
              update: {},
              create: { runId, userId: u.id, email, targetCount: targetsForRegion.length, status: 'regional', region },
            })
            regionalSent++
            console.log(`[intel-report] regional email sent region=${region} userId=${u.id} email=${email} runId=${runId}`)
          } catch (err) {
            console.error(`Failed to send regional report (${region}) to ${email}:`, err)
            await prisma.intelligenceEmailLog.upsert({
              where: { runId_userId_status_region: { runId, userId: u.id, status: 'failed', region } },
              update: {},
              create: { runId, userId: u.id, email, targetCount: 0, status: 'failed', region },
            })
          }
        }
      }

      // 5f. Unassigned bucket → root/marketing users only.
      const unassignedTargets = regionBuckets.get(UNASSIGNED) ?? []
      if (unassignedTargets.length > 0 && clerkEnabled) {
        const client = await clerkClient()
        const allUsers = await client.users.getUserList({ limit: 500 })
        console.log(`[intel-report] unassigned targets=${unassignedTargets.length} privilegedUsers=${allUsers.data.filter(u => u.publicMetadata.role === Roles.Root || u.publicMetadata.role === Roles.Marketing).length} runId=${runId}`)
        const privilegedUsers = allUsers.data.filter(u =>
          u.publicMetadata.role === Roles.Root || u.publicMetadata.role === Roles.Marketing,
        )

        const alreadyLoggedUnassigned = await prisma.intelligenceEmailLog.findMany({
          where: { runId, status: 'unassigned' },
          select: { userId: true },
        })
        const skipUserIds = new Set(alreadyLoggedUnassigned.map(l => l.userId))

        for (const u of privilegedUsers) {
          if (skipUserIds.has(u.id)) continue
          const email = u.emailAddresses[0]?.emailAddress
          if (!email) continue
          try {
            const firstName = u.firstName ?? email ?? 'Team'
            const reportToken = signReportToken(u.id, email)
            const { subject, html } = await composeRegionalEmail(
              firstName, 'No Region', unassignedTargets, pipelineEvents, runDate, appUrl, reportToken,
            )
            await sendPlainEmail(email, subject, html)
            await prisma.intelligenceEmailLog.create({
              data: { runId, userId: u.id, email, targetCount: unassignedTargets.length, status: 'unassigned' },
            })
            unassignedSent++
          } catch (err) {
            console.error(`Failed to send unassigned regional report to ${email}:`, err)
            await prisma.intelligenceEmailLog.create({
              data: { runId, userId: u.id, email, targetCount: 0, status: 'failed' },
            })
          }
        }
      }
    } catch (err) {
      console.error('[intel-report] Regional dispatch failed:', err)
      // Non-fatal: per-subscriber digests have already been sent.
    }
  }

  const consumed = subscriberOffset + subscribers.length
  const nextOffset = consumed >= totalSubscribers ? -1 : consumed
  return NextResponse.json({
    status: 'ok',
    emailsSent,
    regionalSent,
    unassignedSent,
    emailsSkippedAlreadySent,
    subscriberOffset,
    subscribersInSlice: subscribers.length,
    nextOffset,
    total: totalSubscribers,
  })
}
