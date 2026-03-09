# Autonomous Market Intelligence System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an autonomous pipeline where OpenClaw researches target companies/attendees twice weekly and delivers personalised intelligence briefing emails to subscribed internal users.

**Architecture:** OpenClaw Cron fetches priority targets from a new read-only API, researches them, then POSTs structured JSON to a webhook. The webhook stores reports in the DB, matches each subscriber's meetings against updated targets, composes personalised HTML emails via Gemini, and sends via nodemailer.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Clerk auth, `@google/generative-ai` (direct SDK — not Vercel AI SDK), nodemailer, OpenClaw Cron

**Design doc:** `docs/plans/2026-03-09-autonomous-intelligence-design.md`

---

## Context: How This Codebase Works

- **API routes:** `app/api/[resource]/route.ts` — export named functions `GET`, `POST`, `DELETE`, etc.
- **Auth:** Routes use `withAuth()` wrapper from `lib/with-auth.ts`. Webhook routes bypass this and validate a Bearer token manually.
- **Gemini (non-streaming):** Use `@google/generative-ai` directly — see `app/api/attendees/autocomplete/route.ts` for the exact pattern. API key comes from `prisma.systemSettings.findFirst()`.
- **Email:** `lib/email.ts` exports `sendEmail()` — currently requires ICS attachment params. We'll add a new `sendPlainEmail()` alongside it.
- **Prisma:** `import prisma from '@/lib/prisma'`
- **No test framework is configured.** Verify each task manually using `curl` commands provided, and by checking the running dev server (`npm run dev`).

---

## Task 1: Database Schema — Add 3 New Models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the three models to the bottom of `prisma/schema.prisma`**

```prisma
model IntelligenceSubscription {
  id        String   @id @default(cuid())
  userId    String   @unique
  email     String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model IntelligenceReport {
  id         String   @id @default(cuid())
  runId      String
  targetType String
  targetName String
  summary    String
  salesAngle String
  fullReport String
  createdAt  DateTime @default(now())

  @@index([runId])
  @@index([targetName])
}

model IntelligenceEmailLog {
  id          String   @id @default(cuid())
  runId       String
  userId      String
  email       String
  sentAt      DateTime @default(now())
  targetCount Int
  status      String

  @@index([runId, userId])
}
```

**Step 2: Run migration**

```bash
npx prisma migrate dev --name add-intelligence-models
```

Expected: migration file created in `prisma/migrations/`, Prisma client regenerated.

**Step 3: Verify**

```bash
npx prisma studio
```

Open `http://localhost:5555` and confirm the three new tables appear in the left sidebar.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add IntelligenceSubscription, IntelligenceReport, IntelligenceEmailLog models"
```

---

## Task 2: Environment Variable

**Files:**
- Modify: `.env` (and `.env.multi` if you use the multi-event DB config)

**Step 1: Add the secret key**

Add to `.env`:
```bash
INTELLIGENCE_SECRET_KEY=your-secret-key-here
```

Generate a strong random value:
```bash
openssl rand -hex 32
```

Also add to `.env.multi` if it exists:
```bash
grep -l "DATABASE_URL" .env.multi 2>/dev/null && echo "also update .env.multi"
```

**Step 2: Document it**

The key is shared between the NextJS app and the OpenClaw cron prompt. Store it in OpenClaw's credentials separately (not committed).

**Step 3: Commit**

```bash
git add .env.multi 2>/dev/null; git commit -m "feat: add INTELLIGENCE_SECRET_KEY env var placeholder" --allow-empty
```

Note: Do NOT commit `.env` itself (it's gitignored).

---

## Task 3: Targets API Endpoint (Phase 1 Data Bridge)

**Files:**
- Create: `app/api/intelligence/targets/route.ts`

**Step 1: Create the directory and file**

```bash
mkdir -p app/api/intelligence/targets
```

**Step 2: Write the route**

```typescript
// app/api/intelligence/targets/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function validateSecret(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === process.env.INTELLIGENCE_SECRET_KEY && token.length > 0
}

export async function GET(req: Request) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      _count: { select: { attendees: true } },
    },
  })

  // Count upcoming meetings per company
  const upcomingEventIds = windowEvents
    .filter(() => true) // re-query below for upcoming only
    .map((e) => e.id)

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
      _count: { select: { meetings: true } },
    },
  })

  return NextResponse.json({
    generatedAt: now.toISOString(),
    companies: companies.map((c) => ({
      name: c.name,
      pipelineValue: c.pipelineValue ?? 0,
      upcomingMeetings: c._count.attendees, // approximation — meetings via attendees
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
}
```

**Step 3: Test with curl**

Start dev server in another terminal: `npm run dev`

```bash
curl -s -H "Authorization: Bearer $(grep INTELLIGENCE_SECRET_KEY .env | cut -d= -f2)" \
  http://localhost:3000/api/intelligence/targets | python3 -m json.tool
```

Expected: JSON with `companies`, `attendees`, `upcomingEvents` arrays.

Test unauthorized:
```bash
curl -s http://localhost:3000/api/intelligence/targets
```
Expected: `{"error":"Unauthorized"}` with HTTP 401.

**Step 4: Commit**

```bash
git add app/api/intelligence/targets/route.ts
git commit -m "feat: add /api/intelligence/targets endpoint for OpenClaw data bridge"
```

---

## Task 4: Email Helper — Add `sendPlainEmail`

The existing `sendEmail()` in `lib/email.ts` requires an ICS attachment. Add a simpler variant for intelligence emails.

**Files:**
- Modify: `lib/email.ts`

**Step 1: Append `sendPlainEmail` to `lib/email.ts`**

```typescript
export async function sendPlainEmail(to: string, subject: string, html: string) {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Event Planner" <noreply@eventplanner.com>',
    to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ''), // naive HTML-to-text strip
  })
  console.log('Intelligence email sent: %s', info.messageId)
  return info
}
```

**Step 2: Test**

No direct test here — it will be exercised in Task 7. Verify TypeScript compiles:
```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add sendPlainEmail helper for intelligence emails"
```

---

## Task 5: Intelligence Email Composition Library

This module takes a subscriber's matched targets + upcoming events and calls Gemini to compose a personalised HTML email.

**Files:**
- Create: `lib/intelligence-email.ts`

**Step 1: Write the module**

```typescript
// lib/intelligence-email.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

export type TargetUpdate = {
  type: 'company' | 'attendee'
  name: string
  summary: string
  salesAngle: string
  fullReport: string
}

export type UpcomingEvent = {
  name: string
  startDate: string | null
  endDate: string | null
  status: string
}

export async function composeIntelligenceEmail(
  recipientName: string,
  recipientEmail: string,
  matchedTargets: TargetUpdate[],
  upcomingEvents: UpcomingEvent[]
): Promise<{ subject: string; html: string }> {
  const settings = await prisma.systemSettings.findFirst()
  if (!settings?.geminiApiKey) {
    throw new Error('Gemini API key not configured in system settings')
  }

  const genAI = new GoogleGenerativeAI(settings.geminiApiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })

  const targetsText = matchedTargets
    .map(
      (t) =>
        `## ${t.name} (${t.type})\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n\nFull Report:\n${t.fullReport}`
    )
    .join('\n\n---\n\n')

  const eventsText = upcomingEvents
    .map((e) => `- ${e.name}: ${e.startDate ?? 'TBD'} to ${e.endDate ?? 'TBD'} (${e.status})`)
    .join('\n')

  const prompt = `You are composing a market intelligence briefing email for an internal Rakuten Symphony sales/marketing team member.

Recipient: ${recipientName} (${recipientEmail})

Their relevant contacts and companies have the following intelligence updates:

${targetsText}

Upcoming events in the next 30 days:
${eventsText || 'No upcoming events.'}

Write a concise, professional HTML email. Rules:
1. First line: "Subject: <your subject line here>" (on its own line)
2. Then a blank line
3. Then the full HTML body starting with <html>
4. Structure: personalised opening sentence, then one <h3> per updated target with 2-3 bullet points of key updates and a "Sales Angle:" callout in a <blockquote>, then an upcoming events <table>, then an unsubscribe footer with this link: ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/intelligence/unsubscribe?token=${recipientEmail}
5. Tone: sharp, B2B sales, no fluff. Max 600 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  // Parse subject line from first line
  const lines = text.split('\n')
  const subjectLine = lines[0].startsWith('Subject:') ? lines[0].slice(8).trim() : 'Your Market Intelligence Briefing'
  const htmlBody = lines.slice(1).join('\n').trim()

  return { subject: subjectLine, html: htmlBody }
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add lib/intelligence-email.ts
git commit -m "feat: add intelligence email composition lib using Gemini"
```

---

## Task 6: Webhook Handler (Phase 3 Core)

This is the main handler: stores reports, matches subscribers, dispatches emails.

**Files:**
- Create: `app/api/webhooks/intel-report/route.ts`

**Step 1: Create directory**

```bash
mkdir -p app/api/webhooks/intel-report
```

**Step 2: Write the route**

```typescript
// app/api/webhooks/intel-report/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { composeIntelligenceEmail, type TargetUpdate, type UpcomingEvent } from '@/lib/intelligence-email'
import { sendPlainEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
// Intelligence emails can take a while — Gemini per subscriber
export const maxDuration = 300

function validateSecret(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === process.env.INTELLIGENCE_SECRET_KEY && token.length > 0
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

  // 1. Upsert reports (idempotent — safe if OpenClaw retries)
  for (const target of updatedTargets) {
    await prisma.intelligenceReport.upsert({
      where: {
        // Need a unique constraint — use a compound approach via findFirst + create
        id: (await prisma.intelligenceReport.findFirst({
          where: { runId, targetName: target.name },
          select: { id: true },
        }))?.id ?? '',
      },
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
  }

  // 2. If no updated targets, log and return early
  if (updatedTargets.length === 0) {
    console.log(`Intelligence run ${runId}: no updated targets, skipping email dispatch`)
    return NextResponse.json({ status: 'ok', emailsSent: 0 })
  }

  // 3. Fetch upcoming events for all emails (same for everyone)
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
  const upcomingEvents: UpcomingEvent[] = upcomingEventRecords.map((e) => ({
    name: e.name,
    startDate: e.startDate?.toISOString().split('T')[0] ?? null,
    endDate: e.endDate?.toISOString().split('T')[0] ?? null,
    status: e.status,
  }))

  // 4. Build a lookup: target name (lowercase) → target update
  const targetMap = new Map<string, TargetUpdate>()
  for (const t of updatedTargets) {
    targetMap.set(t.name.toLowerCase(), t)
  }

  // 5. Fetch all active subscribers
  const subscribers = await prisma.intelligenceSubscription.findMany({
    where: { active: true },
  })

  let emailsSent = 0

  for (const subscriber of subscribers) {
    try {
      // Find their Attendee record by email
      const attendee = await prisma.attendee.findUnique({
        where: { email: subscriber.email },
        select: { id: true, name: true },
      })

      if (!attendee) {
        await prisma.intelligenceEmailLog.create({
          data: {
            runId,
            userId: subscriber.userId,
            email: subscriber.email,
            targetCount: 0,
            status: 'skipped',
          },
        })
        continue
      }

      // Get all meetings this person attended → their external contacts
      const meetings = await prisma.meeting.findMany({
        where: {
          attendees: { some: { id: attendee.id } },
        },
        select: {
          attendees: {
            select: {
              name: true,
              company: { select: { name: true } },
            },
          },
        },
      })

      // Collect unique company names and attendee names from their meetings
      const companyNames = new Set<string>()
      const attendeeNames = new Set<string>()
      for (const meeting of meetings) {
        for (const a of meeting.attendees) {
          if (a.name !== attendee.name) { // exclude self
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
          data: {
            runId,
            userId: subscriber.userId,
            email: subscriber.email,
            targetCount: 0,
            status: 'skipped',
          },
        })
        continue
      }

      // Compose and send email
      const { subject, html } = await composeIntelligenceEmail(
        attendee.name,
        subscriber.email,
        matched,
        upcomingEvents
      )

      await sendPlainEmail(subscriber.email, subject, html)

      await prisma.intelligenceEmailLog.create({
        data: {
          runId,
          userId: subscriber.userId,
          email: subscriber.email,
          targetCount: matched.length,
          status: 'sent',
        },
      })

      emailsSent++
    } catch (err) {
      console.error(`Failed to process subscriber ${subscriber.email}:`, err)
      await prisma.intelligenceEmailLog.create({
        data: {
          runId,
          userId: subscriber.userId,
          email: subscriber.email,
          targetCount: 0,
          status: 'failed',
        },
      })
    }
  }

  return NextResponse.json({ status: 'ok', emailsSent })
}
```

**Step 3: Fix the upsert — Prisma requires a true unique field**

The upsert above has a workaround for missing compound unique. Add a proper unique constraint to the schema instead:

In `prisma/schema.prisma`, add `@@unique([runId, targetName])` to `IntelligenceReport`:

```prisma
model IntelligenceReport {
  id         String   @id @default(cuid())
  runId      String
  targetType String
  targetName String
  summary    String
  salesAngle String
  fullReport String
  createdAt  DateTime @default(now())

  @@unique([runId, targetName])   // ← add this
  @@index([runId])
  @@index([targetName])
}
```

Then run migration:
```bash
npx prisma migrate dev --name add-intelligence-report-unique
```

Now simplify the upsert in the route to use the compound unique:

```typescript
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
```

**Step 4: Test with curl (empty targets — smoke test)**

```bash
SECRET=$(grep INTELLIGENCE_SECRET_KEY .env | cut -d= -f2)
curl -s -X POST http://localhost:3000/api/webhooks/intel-report \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-2026-03-09","timestamp":"2026-03-09T06:00:00Z","updatedTargets":[]}' \
  | python3 -m json.tool
```

Expected: `{"status":"ok","emailsSent":0}`

Test unauthorized:
```bash
curl -s -X POST http://localhost:3000/api/webhooks/intel-report \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `{"error":"Unauthorized"}`

**Step 5: Commit**

```bash
git add app/api/webhooks/intel-report/route.ts prisma/schema.prisma prisma/migrations/
git commit -m "feat: add /api/webhooks/intel-report webhook handler with subscriber matching and email dispatch"
```

---

## Task 7: Unsubscribe Endpoint

**Files:**
- Create: `app/api/intelligence/unsubscribe/route.ts`

**Step 1: Write the route**

```typescript
// app/api/intelligence/unsubscribe/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') // token = userId (Clerk ID) OR email

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // token can be userId or email — try both
  const sub = await prisma.intelligenceSubscription.findFirst({
    where: { OR: [{ userId: token }, { email: token }] },
  })

  if (!sub) {
    // Return success anyway — idempotent
    return NextResponse.redirect(
      new URL('/intelligence/subscribe?unsubscribed=true', req.url)
    )
  }

  await prisma.intelligenceSubscription.update({
    where: { id: sub.id },
    data: { active: false },
  })

  return NextResponse.redirect(
    new URL('/intelligence/subscribe?unsubscribed=true', req.url)
  )
}
```

**Step 2: Test**

First create a test subscription (we'll build the proper UI in Task 9, but you can insert directly via Prisma Studio or curl after Task 8).

**Step 3: Commit**

```bash
git add app/api/intelligence/unsubscribe/route.ts
git commit -m "feat: add /api/intelligence/unsubscribe one-click endpoint"
```

---

## Task 8: Subscribe/Unsubscribe API Endpoints

**Files:**
- Create: `app/api/intelligence/subscribe/route.ts`

**Step 1: Write the route**

```typescript
// app/api/intelligence/subscribe/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

// POST — subscribe or reactivate
async function postHandler(req: Request, ctx: { authCtx: { userId: string } }) {
  const { userId } = ctx.authCtx

  // Get email from Clerk user via the request body
  const body = await req.json().catch(() => ({}))
  const email: string = body.email

  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const sub = await prisma.intelligenceSubscription.upsert({
    where: { userId },
    update: { active: true, email },
    create: { userId, email, active: true },
  })

  return NextResponse.json({ subscribed: true, email: sub.email })
}

// DELETE — deactivate
async function deleteHandler(_req: Request, ctx: { authCtx: { userId: string } }) {
  const { userId } = ctx.authCtx

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ subscribed: false })
  }

  await prisma.intelligenceSubscription.update({
    where: { userId },
    data: { active: false },
  })

  return NextResponse.json({ subscribed: false })
}

// GET — check subscription status + last email log
async function getHandler(_req: Request, ctx: { authCtx: { userId: string } }) {
  const { userId } = ctx.authCtx

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  const lastLog = sub
    ? await prisma.intelligenceEmailLog.findFirst({
        where: { userId, status: 'sent' },
        orderBy: { sentAt: 'desc' },
      })
    : null

  return NextResponse.json({
    subscribed: sub?.active ?? false,
    email: sub?.email ?? null,
    lastSentAt: lastLog?.sentAt ?? null,
    lastTargetCount: lastLog?.targetCount ?? null,
  })
}

export const POST = withAuth(postHandler)
export const DELETE = withAuth(deleteHandler)
export const GET = withAuth(getHandler)
```

**Step 2: Test**

With dev server running and auth disabled (`NEXT_PUBLIC_DISABLE_CLERK_AUTH=true`):

```bash
# Subscribe
curl -s -X POST http://localhost:3000/api/intelligence/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' | python3 -m json.tool

# Check status
curl -s http://localhost:3000/api/intelligence/subscribe | python3 -m json.tool

# Unsubscribe
curl -s -X DELETE http://localhost:3000/api/intelligence/subscribe | python3 -m json.tool
```

**Step 3: Commit**

```bash
git add app/api/intelligence/subscribe/route.ts
git commit -m "feat: add /api/intelligence/subscribe GET/POST/DELETE endpoints"
```

---

## Task 9: Subscription Management UI

**Files:**
- Create: `app/intelligence/subscribe/page.tsx`

**Step 1: Create directory**

```bash
mkdir -p app/intelligence/subscribe
```

**Step 2: Write the page**

```typescript
// app/intelligence/subscribe/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

type SubscriptionStatus = {
  subscribed: boolean
  email: string | null
  lastSentAt: string | null
  lastTargetCount: number | null
}

function SubscribePage() {
  const { user, isLoaded } = useUser()
  const searchParams = useSearchParams()
  const justUnsubscribed = searchParams.get('unsubscribed') === 'true'

  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null

  useEffect(() => {
    if (!isLoaded) return
    fetch('/api/intelligence/subscribe')
      .then((r) => r.json())
      .then((data) => {
        setStatus(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load subscription status')
        setLoading(false)
      })
  }, [isLoaded])

  const handleToggle = async () => {
    if (!userEmail || !status) return
    setToggling(true)
    setError(null)
    try {
      if (status.subscribed) {
        await fetch('/api/intelligence/subscribe', { method: 'DELETE' })
        setStatus({ ...status, subscribed: false })
      } else {
        const res = await fetch('/api/intelligence/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        })
        const data = await res.json()
        setStatus({ ...status, subscribed: data.subscribed, email: data.email })
      }
    } catch {
      setError('Failed to update subscription')
    } finally {
      setToggling(false)
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="max-w-xl mx-auto p-8 text-zinc-500 text-sm">Loading...</div>
    )
  }

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-xl font-semibold text-zinc-900 mb-2">
        Market Intelligence Subscription
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Receive a personalised intelligence briefing after each research cycle
        (Tuesday &amp; Thursday mornings). Your report covers companies and
        contacts from your meetings, plus upcoming events.
      </p>

      {justUnsubscribed && (
        <div className="mb-4 p-3 bg-zinc-100 border border-zinc-200 rounded-lg text-sm text-zinc-600">
          You&apos;ve been unsubscribed successfully.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Send briefings to</p>
            <p className="text-sm text-zinc-500 font-mono mt-0.5">
              {userEmail ?? '—'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling || !userEmail}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              status?.subscribed ? 'bg-zinc-900' : 'bg-zinc-300'
            } ${toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                status?.subscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {!userEmail && (
          <p className="mt-3 text-xs text-zinc-400">
            No email address found on your account.
          </p>
        )}
      </div>

      {status?.subscribed && (
        <div className="mt-4 space-y-1 text-sm text-zinc-500">
          {status.lastSentAt ? (
            <>
              <p>
                Last briefing sent:{' '}
                <span className="text-zinc-700 font-medium">
                  {new Date(status.lastSentAt).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </p>
              <p>
                Targets in last report:{' '}
                <span className="text-zinc-700 font-medium">
                  {status.lastTargetCount} update
                  {status.lastTargetCount !== 1 ? 's' : ''}
                </span>
              </p>
            </>
          ) : (
            <p>No briefings sent yet — your first will arrive after the next research cycle.</p>
          )}
        </div>
      )}

      {status?.subscribed === false && !justUnsubscribed && (
        <p className="mt-4 text-sm text-zinc-400">
          Toggle on to start receiving briefings.
        </p>
      )}

      {/* Warning if user has no attendee record yet */}
      {status?.subscribed && (
        <NoMeetingsWarning email={userEmail} />
      )}
    </div>
  )
}

function NoMeetingsWarning({ email }: { email: string | null }) {
  const [hasMeetings, setHasMeetings] = useState<boolean | null>(null)

  useEffect(() => {
    if (!email) return
    // Check via the subscribe GET endpoint — if lastTargetCount was null and no meetings,
    // we infer via the attendee check. We do a lightweight check here.
    fetch(`/api/intelligence/subscribe`)
      .then((r) => r.json())
      .then((data) => {
        // If they've never received an email, show the warning
        setHasMeetings(data.lastSentAt !== null)
      })
      .catch(() => setHasMeetings(true)) // fail silently
  }, [email])

  if (hasMeetings !== false) return null

  return (
    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
      You haven&apos;t been added to any meetings yet. You&apos;re subscribed and
      will receive briefings once you&apos;re included in meetings.
    </div>
  )
}

export default function SubscribePageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-500 text-sm">Loading...</div>}>
      <SubscribePage />
    </Suspense>
  )
}
```

**Step 3: Test**

Navigate to `http://localhost:3000/intelligence/subscribe`. Verify:
- Toggle shows current state
- Clicking toggle calls POST/DELETE and updates the UI
- Email address is shown from Clerk

**Step 4: Commit**

```bash
git add app/intelligence/subscribe/page.tsx
git commit -m "feat: add intelligence subscription management UI"
```

---

## Task 10: Navigation — Link from Intelligence Page

**Files:**
- Modify: `app/intelligence/page.tsx`

**Step 1: Read the current intelligence page**

```bash
cat app/intelligence/page.tsx
```

**Step 2: Add a "Subscribe to Briefings" link**

The page currently renders `<IntelligenceChat />`. Wrap it to add a header link:

```typescript
// app/intelligence/page.tsx
"use client";

import { Suspense } from "react";
import Link from "next/link";
import IntelligenceChat from "@/components/IntelligenceChat";

export default function StandaloneIntelligencePage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading OpenClaw Insights...</div>}>
            <div className="relative">
                <div className="absolute top-4 right-4 z-20">
                    <Link
                        href="/intelligence/subscribe"
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 underline underline-offset-2 transition-colors"
                    >
                        Subscribe to Briefings
                    </Link>
                </div>
                <IntelligenceChat />
            </div>
        </Suspense>
    );
}
```

**Step 3: Test**

Navigate to `http://localhost:3000/intelligence` — confirm "Subscribe to Briefings" link appears top-right and navigates to the subscribe page.

**Step 4: Commit**

```bash
git add app/intelligence/page.tsx
git commit -m "feat: add Subscribe to Briefings navigation link on intelligence page"
```

---

## Task 11: End-to-End Test — Full Webhook Flow

Before configuring OpenClaw, do a complete test of the webhook pipeline with real data.

**Step 1: Create a test subscription**

Ensure you're logged in and subscribed at `http://localhost:3000/intelligence/subscribe`.

**Step 2: Verify your email appears in the DB**

```bash
npx prisma studio
```

Open `IntelligenceSubscription` table — confirm your record is there with `active: true`.

**Step 3: Fire a test webhook with a real target**

Pick a company name that matches one in your DB (check Prisma Studio → `Company` table):

```bash
SECRET=$(grep INTELLIGENCE_SECRET_KEY .env | cut -d= -f2)
curl -s -X POST http://localhost:3000/api/webhooks/intel-report \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "test-manual-2026-03-09",
    "timestamp": "2026-03-09T06:00:00Z",
    "updatedTargets": [
      {
        "type": "company",
        "name": "REPLACE_WITH_REAL_COMPANY_NAME",
        "summary": "AT&T announced expansion of Open RAN trials to 12 additional markets in Q2 2026.",
        "salesAngle": "Prime opportunity to position our radio portfolio for the expanded trial rollout.",
        "fullReport": "## AT&T Open RAN Update\n\nAT&T has announced significant expansion..."
      }
    ]
  }' | python3 -m json.tool
```

Expected: `{"status":"ok","emailsSent":1}` (if you have meetings with that company).

**Step 4: Check your inbox**

Verify the email arrived, HTML renders correctly, subject line is meaningful, unsubscribe link is present.

**Step 5: Check logs in Prisma Studio**

Open `IntelligenceEmailLog` — confirm a `sent` record exists for your email with `targetCount: 1`.

---

## Task 12: OpenClaw Cron Configuration (Phase 2)

**Files:**
- Modify: `~/.openclaw/cron/jobs.json`

**Step 1: Determine your app's production URL**

If running locally only, use `http://localhost:3000`. If deployed to Hetzner, use your domain.

**Step 2: Store the secret in OpenClaw credentials**

OpenClaw stores credentials at `~/.openclaw/credentials/`. Add the key there (check OpenClaw docs for exact format), or include it directly in the cron prompt using an env var reference if OpenClaw supports it.

**Step 3: Add the cron job**

Edit `~/.openclaw/cron/jobs.json`. The format is OpenClaw's cron spec — check `~/.openclaw/agents/main/agent/agent.json` for the exact schema, then add:

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "intelligence-cycle",
      "schedule": "0 6 * * 2,4",
      "agentId": "main",
      "prompt": "You are running an autonomous market intelligence cycle for Rakuten Symphony's event pipeline. Follow these steps exactly:\n\n1. FETCH TARGETS\n   web_fetch GET https://YOUR_APP_URL/api/intelligence/targets\n   Header: Authorization: Bearer YOUR_SECRET_KEY\n   Parse into companies[], attendees[], and upcomingEvents[].\n\n2. RESEARCH EACH TARGET\n   For each company and attendee:\n   a. Check memory/{Target_Name}.md — if updated within 48 hours, skip it.\n   b. Otherwise run ONE web_search: \"<Target> telecom B2B strategy announcements 2026\" with freshness: \"pw\".\n   c. If a second angle is missing (exec change, acquisition, spectrum), add ONE more web_search. Max 2 per target.\n   d. Synthesize: what changed, and why it matters to Rakuten Symphony's radio/cloud/automation portfolio.\n   e. Update memory/{Target_Name}.md with new findings.\n\n3. BUILD PAYLOAD\n   Construct JSON: { runId: 'YYYY-MM-DD-cron', timestamp: ISO, updatedTargets: [{ type, name, summary, salesAngle, fullReport }] }\n   Use the EXACT name from the targets response. Include only targets with new intelligence.\n   If none updated, send with empty updatedTargets[].\n\n4. DELIVER\n   web_fetch POST YOUR_APP_URL/api/webhooks/intel-report\n   Header: Authorization: Bearer YOUR_SECRET_KEY\n   Body: JSON payload. Confirm HTTP 200.\n\n5. LOG\n   Append summary to memory/YYYY-MM-DD.md: targets fetched, researched, skipped, POST status."
    }
  ]
}
```

Replace `YOUR_APP_URL` and `YOUR_SECRET_KEY` with actual values.

**Step 4: Verify cron registered**

```bash
openclaw cron list
```

Expected: the `intelligence-cycle` job appears with next run time.

**Step 5: Trigger a manual test run**

```bash
openclaw cron run intelligence-cycle
```

Watch the output — verify it fetches targets, runs searches, and POSTs to the webhook.

---

## Done — Verification Checklist

- [ ] `GET /api/intelligence/targets` returns companies/attendees/events, rejects bad tokens
- [ ] `POST /api/webhooks/intel-report` stores reports, dispatches emails, is idempotent on `runId`
- [ ] `GET/POST/DELETE /api/intelligence/subscribe` manages subscriptions correctly
- [ ] `GET /api/intelligence/unsubscribe?token=X` deactivates subscription and redirects
- [ ] `/intelligence/subscribe` page shows correct state, toggle works, shows last send stats
- [ ] End-to-end: manual webhook POST → email received with correct personalisation and unsubscribe link
- [ ] OpenClaw cron job registered and tested manually
