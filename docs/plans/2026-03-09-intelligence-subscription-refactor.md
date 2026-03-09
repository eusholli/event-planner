# Intelligence Subscription Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the passive meeting-based intelligence subscription with an explicit selection model where users choose which attendees, companies, and events to track.

**Architecture:** Three Prisma junction tables (`IntelligenceSubAttendee/Company/Event`) link each `IntelligenceSubscription` to selected entities. `subscriptionCount` fields on Attendee/Company/Event drive what OpenClaw researches. The webhook handler matches updated targets against user selections and sends personalized emails; root/marketing users automatically receive an aggregate report via Clerk backend SDK.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Clerk (auth + backend SDK for user list), `@google/generative-ai`, nodemailer

**Design doc:** `docs/plans/2026-03-09-intelligence-subscription-refactor-design.md`

---

## Context: How This Codebase Works

- **No test framework.** All verification via `curl` commands against `npm run dev` (localhost:3000).
- **API routes:** `app/api/[resource]/route.ts` — export named functions `GET`, `POST`, `DELETE`.
- **Auth wrapper:** `withAuth()` from `lib/with-auth.ts`. All intelligence subscribe endpoints use this. Webhook/targets endpoints validate `Authorization: Bearer <INTELLIGENCE_SECRET_KEY>` manually.
- **Prisma:** `import prisma from '@/lib/prisma'`
- **Clerk backend:** `import { clerkClient, currentUser } from '@clerk/nextjs/server'` — see `app/api/admin/users/route.ts` for usage pattern. `await clerkClient()` returns the client. Role is in `user.publicMetadata.role`.
- **Email:** `import { sendPlainEmail } from '@/lib/email'`
- **Gemini:** `import { GoogleGenerativeAI } from '@google/generative-ai'` — API key from `prisma.systemSettings.findFirst()`.
- **Roles:** `Roles.Root = 'root'`, `Roles.Marketing = 'marketing'` from `lib/constants.ts`.
- **`subscriptionCount` semantics:** Counts ALL subscriptions (active or inactive) that have selected this entity. Simple to maintain; import recalculates from scratch for accuracy.

---

## Task 1: Schema — Add subscriptionCount + 3 Junction Models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add `subscriptionCount` to Event, Company, Attendee models**

In `prisma/schema.prisma`, add `subscriptionCount Int @default(0)` to each model:

```prisma
model Event {
  // ...existing fields...
  subscriptionCount Int @default(0)
  // add these relation fields at the bottom:
  intelligenceSubEvents IntelligenceSubEvent[]
}

model Company {
  // ...existing fields...
  subscriptionCount Int @default(0)
  intelligenceSubCompanies IntelligenceSubCompany[]
}

model Attendee {
  // ...existing fields...
  subscriptionCount Int @default(0)
  intelligenceSubAttendees IntelligenceSubAttendee[]
}
```

**Step 2: Add relations to `IntelligenceSubscription`**

```prisma
model IntelligenceSubscription {
  id               String   @id @default(cuid())
  userId           String   @unique
  email            String
  active           Boolean  @default(true)
  unsubscribeToken String   @unique @default(cuid())
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  selectedAttendees IntelligenceSubAttendee[]
  selectedCompanies IntelligenceSubCompany[]
  selectedEvents    IntelligenceSubEvent[]
}
```

**Step 3: Add the 3 junction models (append to bottom of schema)**

```prisma
model IntelligenceSubAttendee {
  subscriptionId String
  attendeeId     String
  subscription   IntelligenceSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  attendee       Attendee                 @relation(fields: [attendeeId], references: [id], onDelete: Cascade)
  @@id([subscriptionId, attendeeId])
}

model IntelligenceSubCompany {
  subscriptionId String
  companyId      String
  subscription   IntelligenceSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  company        Company                  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@id([subscriptionId, companyId])
}

model IntelligenceSubEvent {
  subscriptionId String
  eventId        String
  subscription   IntelligenceSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  event          Event                    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@id([subscriptionId, eventId])
}
```

**Step 4: Run migration**

```bash
npx prisma migrate dev --name add-intelligence-subscription-selections
```

Expected: migration created and applied, Prisma client regenerated.

**Step 5: Verify**

```bash
npx prisma studio
```

Confirm `IntelligenceSubAttendee`, `IntelligenceSubCompany`, `IntelligenceSubEvent` tables exist. Confirm `subscriptionCount` column on Attendee, Company, Event.

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add subscriptionCount and junction tables for intelligence selections"
```

---

## Task 2: Update GET /api/intelligence/subscribe

Return full selection state including `selectedAttendeeIds`, `selectedCompanyIds`, `selectedEventIds`.

**Files:**
- Modify: `app/api/intelligence/subscribe/route.ts`

**Step 1: Update the GET handler**

Replace the existing `GET` export with:

```typescript
// GET — check subscription status + selections + last email log
export const GET = withAuth(async (_req, { authCtx }) => {
  const { userId } = authCtx

  const sub = await prisma.intelligenceSubscription.findUnique({
    where: { userId },
    include: {
      selectedAttendees: { select: { attendeeId: true } },
      selectedCompanies: { select: { companyId: true } },
      selectedEvents:    { select: { eventId: true } },
    },
  })

  const lastLog = sub
    ? await prisma.intelligenceEmailLog.findFirst({
        where: { userId, status: 'sent' },
        orderBy: { sentAt: 'desc' },
      })
    : null

  return NextResponse.json({
    subscribed: sub?.active ?? false,
    email: sub?.email ?? null,
    selectedAttendeeIds: sub?.selectedAttendees.map(r => r.attendeeId) ?? [],
    selectedCompanyIds:  sub?.selectedCompanies.map(r => r.companyId)  ?? [],
    selectedEventIds:    sub?.selectedEvents.map(r => r.eventId)       ?? [],
    lastSentAt:          lastLog?.sentAt ?? null,
    lastTargetCount:     lastLog?.targetCount ?? null,
  })
})
```

**Step 2: Verify**

```bash
# Start dev server if not running: npm run dev
curl -s http://localhost:3000/api/intelligence/subscribe \
  -H "Cookie: <your-clerk-session-cookie>"
```

Expected: JSON with `subscribed`, `email`, `selectedAttendeeIds: []`, `selectedCompanyIds: []`, `selectedEventIds: []`.

**Step 3: Commit**

```bash
git add app/api/intelligence/subscribe/route.ts
git commit -m "feat: return selection IDs from GET /api/intelligence/subscribe"
```

---

## Task 3: Update POST /api/intelligence/subscribe (get email from Clerk)

Remove email from request body — get it from Clerk server-side instead.

**Files:**
- Modify: `app/api/intelligence/subscribe/route.ts`

**Step 1: Update imports at top of file**

```typescript
import { currentUser } from '@clerk/nextjs/server'
```

**Step 2: Replace the POST handler**

```typescript
// POST — subscribe or reactivate
export const POST = withAuth(async (_req, { authCtx }) => {
  const { userId } = authCtx

  // Get email from Clerk
  let email: string | null = null
  if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
    const user = await currentUser()
    email = user?.primaryEmailAddress?.emailAddress ?? null
  } else {
    email = 'mock@example.com'
  }

  if (!email) {
    return NextResponse.json({ error: 'No email address on account' }, { status: 400 })
  }

  const sub = await prisma.intelligenceSubscription.upsert({
    where: { userId },
    update: { active: true, email },
    create: { userId, email, active: true },
  })

  return NextResponse.json({ subscribed: true, email: sub.email })
})
```

**Step 3: Verify**

```bash
curl -s -X POST http://localhost:3000/api/intelligence/subscribe \
  -H "Cookie: <your-clerk-session-cookie>"
```

Expected: `{"subscribed":true,"email":"your@email.com"}`

**Step 4: Commit**

```bash
git add app/api/intelligence/subscribe/route.ts
git commit -m "feat: get email from Clerk server-side in subscribe POST"
```

---

## Task 4: Attendee Selection Endpoints

**Files:**
- Create: `app/api/intelligence/subscribe/attendees/route.ts`
- Create: `app/api/intelligence/subscribe/attendees/[id]/route.ts`

**Step 1: Create `app/api/intelligence/subscribe/attendees/route.ts`**

Helper function `ensureSubscription` is duplicated across attendees/companies/events — accept this duplication (3 small files, YAGNI).

```typescript
// app/api/intelligence/subscribe/attendees/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

// Ensure a subscription record exists for this user (creates inactive one if needed)
async function ensureSubscription(userId: string): Promise<string> {
  let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    let email = 'unknown@example.com'
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
      const user = await currentUser()
      email = user?.primaryEmailAddress?.emailAddress ?? email
    }
    sub = await prisma.intelligenceSubscription.create({
      data: { userId, email, active: false },
    })
  }
  return sub.id
}

// POST — add attendee selection
export const POST = withAuth(async (req, { authCtx }) => {
  const { userId } = authCtx
  const body = await req.json().catch(() => ({}))
  const { attendeeId } = body

  if (!attendeeId || typeof attendeeId !== 'string') {
    return NextResponse.json({ error: 'attendeeId required' }, { status: 400 })
  }

  const subscriptionId = await ensureSubscription(userId)

  // Check attendee exists
  const attendee = await prisma.attendee.findUnique({ where: { id: attendeeId } })
  if (!attendee) {
    return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
  }

  // Upsert junction row + increment count (idempotent)
  const existing = await prisma.intelligenceSubAttendee.findUnique({
    where: { subscriptionId_attendeeId: { subscriptionId, attendeeId } },
  })

  if (!existing) {
    await prisma.$transaction([
      prisma.intelligenceSubAttendee.create({ data: { subscriptionId, attendeeId } }),
      prisma.attendee.update({ where: { id: attendeeId }, data: { subscriptionCount: { increment: 1 } } }),
    ])
  }

  return NextResponse.json({ selected: true, attendeeId })
})
```

**Step 2: Create `app/api/intelligence/subscribe/attendees/[id]/route.ts`**

```typescript
// app/api/intelligence/subscribe/attendees/[id]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

// DELETE — remove attendee selection
export const DELETE = withAuth(async (_req, { authCtx, params }) => {
  const { userId } = authCtx
  const { id: attendeeId } = await params

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ selected: false })
  }

  const existing = await prisma.intelligenceSubAttendee.findUnique({
    where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.intelligenceSubAttendee.delete({
        where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId } },
      }),
      prisma.attendee.update({
        where: { id: attendeeId },
        data: { subscriptionCount: { decrement: 1 } },
      }),
    ])
  }

  return NextResponse.json({ selected: false, attendeeId })
})
```

**Step 3: Verify**

```bash
# First get an attendeeId from the DB (npx prisma studio or curl /api/attendees)
ATTENDEE_ID="<some-attendee-id>"

curl -s -X POST http://localhost:3000/api/intelligence/subscribe/attendees \
  -H "Cookie: <clerk-session>" \
  -H "Content-Type: application/json" \
  -d "{\"attendeeId\": \"$ATTENDEE_ID\"}"
# Expected: {"selected":true,"attendeeId":"..."}

# Check subscriptionCount incremented in prisma studio

curl -s -X DELETE http://localhost:3000/api/intelligence/subscribe/attendees/$ATTENDEE_ID \
  -H "Cookie: <clerk-session>"
# Expected: {"selected":false,"attendeeId":"..."}
```

**Step 4: Commit**

```bash
git add app/api/intelligence/subscribe/attendees/
git commit -m "feat: add attendee selection endpoints for intelligence subscriptions"
```

---

## Task 5: Company Selection Endpoints

**Files:**
- Create: `app/api/intelligence/subscribe/companies/route.ts`
- Create: `app/api/intelligence/subscribe/companies/[id]/route.ts`

**Step 1: Create `app/api/intelligence/subscribe/companies/route.ts`**

```typescript
// app/api/intelligence/subscribe/companies/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

async function ensureSubscription(userId: string): Promise<string> {
  let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    let email = 'unknown@example.com'
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
      const user = await currentUser()
      email = user?.primaryEmailAddress?.emailAddress ?? email
    }
    sub = await prisma.intelligenceSubscription.create({
      data: { userId, email, active: false },
    })
  }
  return sub.id
}

export const POST = withAuth(async (req, { authCtx }) => {
  const { userId } = authCtx
  const body = await req.json().catch(() => ({}))
  const { companyId } = body

  if (!companyId || typeof companyId !== 'string') {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const subscriptionId = await ensureSubscription(userId)

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const existing = await prisma.intelligenceSubCompany.findUnique({
    where: { subscriptionId_companyId: { subscriptionId, companyId } },
  })

  if (!existing) {
    await prisma.$transaction([
      prisma.intelligenceSubCompany.create({ data: { subscriptionId, companyId } }),
      prisma.company.update({ where: { id: companyId }, data: { subscriptionCount: { increment: 1 } } }),
    ])
  }

  return NextResponse.json({ selected: true, companyId })
})
```

**Step 2: Create `app/api/intelligence/subscribe/companies/[id]/route.ts`**

```typescript
// app/api/intelligence/subscribe/companies/[id]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

export const DELETE = withAuth(async (_req, { authCtx, params }) => {
  const { userId } = authCtx
  const { id: companyId } = await params

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ selected: false })
  }

  const existing = await prisma.intelligenceSubCompany.findUnique({
    where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.intelligenceSubCompany.delete({
        where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId } },
      }),
      prisma.company.update({
        where: { id: companyId },
        data: { subscriptionCount: { decrement: 1 } },
      }),
    ])
  }

  return NextResponse.json({ selected: false, companyId })
})
```

**Step 3: Verify** (same pattern as Task 4 but with companyId)

**Step 4: Commit**

```bash
git add app/api/intelligence/subscribe/companies/
git commit -m "feat: add company selection endpoints for intelligence subscriptions"
```

---

## Task 6: Event Selection Endpoints

**Files:**
- Create: `app/api/intelligence/subscribe/events/route.ts`
- Create: `app/api/intelligence/subscribe/events/[id]/route.ts`

**Step 1: Create `app/api/intelligence/subscribe/events/route.ts`**

```typescript
// app/api/intelligence/subscribe/events/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

async function ensureSubscription(userId: string): Promise<string> {
  let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    let email = 'unknown@example.com'
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
      const user = await currentUser()
      email = user?.primaryEmailAddress?.emailAddress ?? email
    }
    sub = await prisma.intelligenceSubscription.create({
      data: { userId, email, active: false },
    })
  }
  return sub.id
}

export const POST = withAuth(async (req, { authCtx }) => {
  const { userId } = authCtx
  const body = await req.json().catch(() => ({}))
  const { eventId } = body

  if (!eventId || typeof eventId !== 'string') {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  const subscriptionId = await ensureSubscription(userId)

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const existing = await prisma.intelligenceSubEvent.findUnique({
    where: { subscriptionId_eventId: { subscriptionId, eventId } },
  })

  if (!existing) {
    await prisma.$transaction([
      prisma.intelligenceSubEvent.create({ data: { subscriptionId, eventId } }),
      prisma.event.update({ where: { id: eventId }, data: { subscriptionCount: { increment: 1 } } }),
    ])
  }

  return NextResponse.json({ selected: true, eventId })
})
```

**Step 2: Create `app/api/intelligence/subscribe/events/[id]/route.ts`**

```typescript
// app/api/intelligence/subscribe/events/[id]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

export const DELETE = withAuth(async (_req, { authCtx, params }) => {
  const { userId } = authCtx
  const { id: eventId } = await params

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ selected: false })
  }

  const existing = await prisma.intelligenceSubEvent.findUnique({
    where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.intelligenceSubEvent.delete({
        where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } },
      }),
      prisma.event.update({
        where: { id: eventId },
        data: { subscriptionCount: { decrement: 1 } },
      }),
    ])
  }

  return NextResponse.json({ selected: false, eventId })
})
```

**Step 3: Verify** (same pattern as Tasks 4–5)

**Step 4: Commit**

```bash
git add app/api/intelligence/subscribe/events/
git commit -m "feat: add event selection endpoints for intelligence subscriptions"
```

---

## Task 7: Update /api/intelligence/targets

Replace meeting-window prioritization with `subscriptionCount > 0` query.

**Files:**
- Modify: `app/api/intelligence/targets/route.ts`

**Step 1: Replace entire file content**

```typescript
// app/api/intelligence/targets/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function validateSecret(req: Request): boolean {
  const secret = process.env.INTELLIGENCE_SECRET_KEY
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
```

**Step 2: Verify**

```bash
curl -s http://localhost:3000/api/intelligence/targets \
  -H "Authorization: Bearer $INTELLIGENCE_SECRET_KEY"
```

Expected: `{"generatedAt":"...","companies":[...],"attendees":[...],"events":[...]}` — all arrays will be empty until users make selections.

To test with data: add a selection via the selection endpoint (Task 4–6), then call targets again — the entity should appear.

**Step 3: Commit**

```bash
git add app/api/intelligence/targets/route.ts
git commit -m "feat: targets endpoint uses subscriptionCount instead of meeting window"
```

---

## Task 8: Update lib/intelligence-email.ts

Add new types for highlighted/event-linked targets and a second `composeAggregateEmail` function.

**Files:**
- Modify: `lib/intelligence-email.ts`

**Step 1: Replace entire file**

```typescript
// lib/intelligence-email.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

export type TargetUpdate = {
  type: 'company' | 'attendee' | 'event'
  name: string
  summary: string
  salesAngle: string
  fullReport: string
  highlighted?: boolean   // true = user directly selected this entity
  linkedEventName?: string // set when this target came from a subscribed event
}

export type UpcomingEvent = {
  name: string
  startDate: string | null
  endDate: string | null
  status: string
}

async function getGeminiModel() {
  const settings = await prisma.systemSettings.findFirst()
  if (!settings?.geminiApiKey) {
    throw new Error('Gemini API key not configured in system settings')
  }
  const genAI = new GoogleGenerativeAI(settings.geminiApiKey)
  return genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })
}

function parseGeminiResponse(text: string): { subject: string; html: string } {
  const lines = text.trim().split('\n')
  const subjectLine = lines[0].startsWith('Subject:') ? lines[0].slice(8).trim() : 'Your Market Intelligence Briefing'
  const htmlBody = lines.slice(1).join('\n').trim()
  return { subject: subjectLine, html: htmlBody }
}

export async function composeIntelligenceEmail(
  recipientName: string,
  recipientEmail: string,
  unsubscribeToken: string,
  matchedTargets: TargetUpdate[],
  upcomingEvents: UpcomingEvent[]
): Promise<{ subject: string; html: string }> {
  const model = await getGeminiModel()

  const highlighted = matchedTargets.filter(t => t.highlighted)
  const eventLinked = matchedTargets.filter(t => !t.highlighted && t.linkedEventName)
  const other = matchedTargets.filter(t => !t.highlighted && !t.linkedEventName)

  const formatTarget = (t: TargetUpdate) =>
    `### ${t.name} (${t.type})\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n\nFull Report:\n${t.fullReport}`

  const highlightedText = highlighted.length
    ? `## ⭐ YOUR DIRECTLY TRACKED TARGETS\n${highlighted.map(formatTarget).join('\n\n---\n\n')}`
    : ''

  const eventLinkedText = eventLinked.length
    ? `## FROM YOUR TRACKED EVENTS\n${eventLinked.map(t => `[${t.linkedEventName}]\n${formatTarget(t)}`).join('\n\n---\n\n')}`
    : ''

  const otherText = other.length
    ? `## OTHER TRACKED TARGETS\n${other.map(formatTarget).join('\n\n---\n\n')}`
    : ''

  const targetsText = [highlightedText, eventLinkedText, otherText].filter(Boolean).join('\n\n')

  const eventsText = upcomingEvents
    .map(e => `- ${e.name}: ${e.startDate ?? 'TBD'} to ${e.endDate ?? 'TBD'} (${e.status})`)
    .join('\n')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const prompt = `You are composing a market intelligence briefing email for an internal Rakuten Symphony sales/marketing team member.

Recipient: ${recipientName} (${recipientEmail})

Intelligence updates for their tracked targets:

${targetsText}

Upcoming events in the next 30 days:
${eventsText || 'No upcoming events.'}

Write a concise, professional HTML email. Rules:
1. First line: "Subject: <your subject line here>" (on its own line)
2. Then a blank line
3. Then the full HTML body starting with <html>
4. Structure:
   - Personalised opening sentence referencing their specific tracked items
   - If there are ⭐ DIRECTLY TRACKED TARGETS: render them first with a bold "⭐ You're tracking this" callout per item
   - If there are FROM YOUR TRACKED EVENTS targets: group them by event name with an <h3> event header
   - Per target: <h3> heading, 2-3 bullet points of key updates, a "Sales Angle:" callout in a <blockquote>
   - Upcoming events as a <table> (columns: Event, Dates, Status)
   - Unsubscribe footer with link: ${appUrl}/api/intelligence/unsubscribe?token=${unsubscribeToken}
5. Tone: sharp, B2B sales, no fluff. Max 800 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await model.generateContent(prompt)
  return parseGeminiResponse(result.response.text())
}

export async function composeAggregateEmail(
  recipientName: string,
  allTargets: TargetUpdate[],
  upcomingEvents: UpcomingEvent[],
  runDate: string
): Promise<{ subject: string; html: string }> {
  const model = await getGeminiModel()

  const byType = {
    company:  allTargets.filter(t => t.type === 'company'),
    attendee: allTargets.filter(t => t.type === 'attendee'),
    event:    allTargets.filter(t => t.type === 'event'),
  }

  const formatTarget = (t: TargetUpdate) =>
    `### ${t.name}\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n\nFull Report:\n${t.fullReport}`

  const targetsText = [
    byType.company.length  ? `## Companies\n${byType.company.map(formatTarget).join('\n\n---\n\n')}`  : '',
    byType.attendee.length ? `## Attendees\n${byType.attendee.map(formatTarget).join('\n\n---\n\n')}` : '',
    byType.event.length    ? `## Events\n${byType.event.map(formatTarget).join('\n\n---\n\n')}`        : '',
  ].filter(Boolean).join('\n\n')

  const eventsText = upcomingEvents
    .map(e => `- ${e.name}: ${e.startDate ?? 'TBD'} to ${e.endDate ?? 'TBD'} (${e.status})`)
    .join('\n')

  const prompt = `You are composing a full market intelligence aggregate report for ${recipientName}, a senior Rakuten Symphony team member with full system access.

Run date: ${runDate}
Total updated targets: ${allTargets.length}

All intelligence updates this run:

${targetsText}

Upcoming events in the next 30 days:
${eventsText || 'No upcoming events.'}

Write a concise, professional HTML email. Rules:
1. First line: "Subject: Intelligence Briefing – All Targets – ${runDate}" (exactly as written)
2. Then a blank line
3. Then the full HTML body starting with <html>
4. Structure:
   - Opening: "Full market intelligence run for ${runDate}. ${allTargets.length} targets updated."
   - Companies section (if any): <h2> heading, then per-company <h3> with 2-3 bullets + Sales Angle <blockquote>
   - Attendees section (if any): same pattern
   - Events section (if any): same pattern
   - Upcoming events <table>
   - No unsubscribe link (this is a system report)
5. Tone: sharp, B2B, executive summary. Max 1200 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await model.generateContent(prompt)
  return parseGeminiResponse(result.response.text())
}
```

**Step 2: Verify**

The module won't break existing code — `composeIntelligenceEmail` signature is compatible (added optional fields to `TargetUpdate`). Check no TypeScript errors:

```bash
npm run build 2>&1 | head -30
```

Expected: no new errors from `lib/intelligence-email.ts`.

**Step 3: Commit**

```bash
git add lib/intelligence-email.ts
git commit -m "feat: update intelligence email with highlighted/event-linked targets and aggregate report"
```

---

## Task 9: Update /api/webhooks/intel-report

New subscriber matching (selection-based) + aggregate report dispatch.

**Files:**
- Modify: `app/api/webhooks/intel-report/route.ts`

**Step 1: Replace entire file**

```typescript
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
      const directAttendeeIds = new Set(subscriber.selectedAttendees.map(r => r.attendeeId))
      const directCompanyIds = new Set(subscriber.selectedCompanies.map(r => r.companyId))

      // Load names for direct attendee/company selections
      const directAttendees = directAttendeeIds.size > 0
        ? await prisma.attendee.findMany({
            where: { id: { in: [...directAttendeeIds] } },
            select: { id: true, name: true },
          })
        : []
      const directCompanies = directCompanyIds.size > 0
        ? await prisma.company.findMany({
            where: { id: { in: [...directCompanyIds] } },
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
          const coKey = att.company.name.toLowerCase()

          if (targetMap.has(attKey) && !alreadyMatchedKeys.has(attKey)) {
            const isHighlighted = directAttendeeNames.has(attKey)
            matched.push({ ...targetMap.get(attKey)!, highlighted: isHighlighted || undefined, linkedEventName: isHighlighted ? undefined : eventName })
            alreadyMatchedKeys.add(attKey)
          }
          if (targetMap.has(coKey) && !alreadyMatchedKeys.has(coKey)) {
            const isHighlighted = directCompanyNames.has(coKey)
            matched.push({ ...targetMap.get(coKey)!, highlighted: isHighlighted || undefined, linkedEventName: isHighlighted ? undefined : eventName })
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
```

**Step 2: Verify**

```bash
curl -s -X POST http://localhost:3000/api/webhooks/intel-report \
  -H "Authorization: Bearer $INTELLIGENCE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "2026-03-09-test",
    "timestamp": "2026-03-09T06:00:00Z",
    "updatedTargets": []
  }'
```

Expected: `{"status":"ok","emailsSent":0}`

Then test with a non-empty `updatedTargets` array using a company name that exists in the DB and that a test user has subscribed to.

**Step 3: Commit**

```bash
git add app/api/webhooks/intel-report/route.ts
git commit -m "feat: update webhook handler with selection-based matching and aggregate report"
```

---

## Task 10: Replace Subscription UI

Replace the entire subscription page with three searchable entity sections.

**Files:**
- Modify: `app/intelligence/subscribe/page.tsx`

**Step 1: Replace entire file**

```typescript
'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'

type EntityType = 'attendee' | 'company' | 'event'

type AttendeeItem = { id: string; name: string; title: string; companyName: string }
type CompanyItem  = { id: string; name: string; description: string | null; pipelineValue: number | null }
type EventItem    = { id: string; name: string; startDate: string | null; endDate: string | null; status: string }

type SubState = {
  subscribed: boolean
  email: string | null
  selectedAttendeeIds: string[]
  selectedCompanyIds: string[]
  selectedEventIds: string[]
  lastSentAt: string | null
  lastTargetCount: number | null
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(val: number | null): string {
  if (!val) return ''
  return ' · $' + (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000).toFixed(0) + 'K')
}

function SubscribePage() {
  const { user, isLoaded } = useUser()
  const searchParams = useSearchParams()
  const justUnsubscribed = searchParams.get('unsubscribed') === 'true'

  const [sub, setSub]             = useState<SubState | null>(null)
  const [attendees, setAttendees] = useState<AttendeeItem[]>([])
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [events, setEvents]       = useState<EventItem[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null

  // Load subscription state + all entities
  useEffect(() => {
    if (!isLoaded) return
    Promise.all([
      fetch('/api/intelligence/subscribe').then(r => r.json()),
      fetch('/api/attendees').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
      fetch('/api/events').then(r => r.json()),
    ])
      .then(([subData, attendeeData, companyData, eventData]) => {
        setSub(subData)
        setAttendees((attendeeData.attendees ?? attendeeData).map((a: any) => ({
          id: a.id,
          name: a.name,
          title: a.title ?? '',
          companyName: a.company?.name ?? a.companyName ?? '',
        })))
        setCompanies((companyData.companies ?? companyData).map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? null,
          pipelineValue: c.pipelineValue ?? null,
        })))
        setEvents((eventData.events ?? eventData).map((e: any) => ({
          id: e.id,
          name: e.name,
          startDate: e.startDate ?? null,
          endDate: e.endDate ?? null,
          status: e.status ?? '',
        })))
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load data')
        setLoading(false)
      })
  }, [isLoaded])

  const q = search.toLowerCase()

  const filteredAttendees = useMemo(() =>
    attendees.filter(a =>
      !q || a.name.toLowerCase().includes(q) || a.title.toLowerCase().includes(q) || a.companyName.toLowerCase().includes(q)
    ), [attendees, q])

  const filteredCompanies = useMemo(() =>
    companies.filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    ), [companies, q])

  const filteredEvents = useMemo(() =>
    events.filter(e =>
      !q || e.name.toLowerCase().includes(q) || (e.status ?? '').toLowerCase().includes(q)
    ), [events, q])

  const totalSelected = (sub?.selectedAttendeeIds.length ?? 0)
    + (sub?.selectedCompanyIds.length ?? 0)
    + (sub?.selectedEventIds.length ?? 0)

  async function toggleSelection(type: EntityType, id: string, isSelected: boolean) {
    if (!sub) return
    const path = `/api/intelligence/subscribe/${type}s`
    const method = isSelected ? 'DELETE' : 'POST'
    const url = isSelected ? `${path}/${id}` : path
    const body = isSelected ? undefined : JSON.stringify({ [`${type}Id`]: id })

    // Optimistic update
    setSub(prev => {
      if (!prev) return prev
      const key = `selected${type.charAt(0).toUpperCase() + type.slice(1)}Ids` as keyof SubState
      const arr = prev[key] as string[]
      return {
        ...prev,
        [key]: isSelected ? arr.filter(x => x !== id) : [...arr, id],
      }
    })

    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      // Revert on error
      setSub(prev => {
        if (!prev) return prev
        const key = `selected${type.charAt(0).toUpperCase() + type.slice(1)}Ids` as keyof SubState
        const arr = prev[key] as string[]
        return {
          ...prev,
          [key]: isSelected ? [...arr, id] : arr.filter(x => x !== id),
        }
      })
      setError('Failed to update selection')
    }
  }

  async function handleToggleSubscribe() {
    if (!sub || toggling) return
    setToggling(true)
    setError(null)
    try {
      if (sub.subscribed) {
        await fetch('/api/intelligence/subscribe', { method: 'DELETE' })
        setSub(prev => prev ? { ...prev, subscribed: false } : prev)
      } else {
        const res = await fetch('/api/intelligence/subscribe', { method: 'POST' })
        const data = await res.json()
        setSub(prev => prev ? { ...prev, subscribed: data.subscribed, email: data.email } : prev)
      }
    } catch {
      setError('Failed to update subscription')
    } finally {
      setToggling(false)
    }
  }

  if (!isLoaded || loading) {
    return <div className="max-w-3xl mx-auto p-8 text-zinc-500 text-sm">Loading...</div>
  }

  const canSubscribe = totalSelected > 0

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-xl font-semibold text-zinc-900 mb-2">Market Intelligence Subscription</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Select the companies, attendees, and events you want to track. You&apos;ll receive a
        personalised briefing after each research cycle (Tuesday &amp; Thursday mornings).
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

      {/* Subscribe toggle */}
      <div className="border border-zinc-200 rounded-xl p-5 bg-white shadow-sm mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Send briefings to</p>
            <p className="text-sm text-zinc-500 font-mono mt-0.5">{userEmail ?? '—'}</p>
            {!canSubscribe && (
              <p className="text-xs text-zinc-400 mt-1">Select at least one item below to subscribe</p>
            )}
          </div>
          <button
            onClick={handleToggleSubscribe}
            disabled={toggling || !userEmail || !canSubscribe}
            title={!canSubscribe ? 'Select at least one item to subscribe' : undefined}
            aria-label={sub?.subscribed ? 'Unsubscribe from briefings' : 'Subscribe to briefings'}
            aria-checked={sub?.subscribed ?? false}
            role="switch"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              sub?.subscribed ? 'bg-zinc-900' : 'bg-zinc-300'
            } ${toggling || !userEmail || !canSubscribe ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              sub?.subscribed ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {sub?.subscribed && sub.lastSentAt && (
          <div className="mt-3 space-y-1 text-sm text-zinc-500">
            <p>Last briefing: <span className="text-zinc-700 font-medium">{formatDate(sub.lastSentAt)}</span></p>
            <p>Targets in last report: <span className="text-zinc-700 font-medium">{sub.lastTargetCount ?? 0}</span></p>
          </div>
        )}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search all events, companies, attendees..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-6 px-4 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
      />

      {/* Events section */}
      {filteredEvents.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 pb-1 border-b border-zinc-200">
            Events {sub && sub.selectedEventIds.length > 0 && (
              <span className="font-normal text-zinc-400">({sub.selectedEventIds.length} selected)</span>
            )}
          </h2>
          <div className="space-y-1">
            {filteredEvents.map(e => {
              const isSelected = sub?.selectedEventIds.includes(e.id) ?? false
              return (
                <label key={e.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection('event', e.id, isSelected)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                  />
                  <span className="text-sm text-zinc-900 flex-1">{e.name}</span>
                  <span className="text-xs text-zinc-400">{formatDate(e.startDate)}–{formatDate(e.endDate)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    e.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                    e.status === 'CANCELED'  ? 'bg-red-100 text-red-700' :
                    'bg-zinc-100 text-zinc-500'
                  }`}>{e.status}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {/* Companies section */}
      {filteredCompanies.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 pb-1 border-b border-zinc-200">
            Companies {sub && sub.selectedCompanyIds.length > 0 && (
              <span className="font-normal text-zinc-400">({sub.selectedCompanyIds.length} selected)</span>
            )}
          </h2>
          <div className="space-y-1">
            {filteredCompanies.map(c => {
              const isSelected = sub?.selectedCompanyIds.includes(c.id) ?? false
              return (
                <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection('company', c.id, isSelected)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                  />
                  <span className="text-sm text-zinc-900 flex-1">{c.name}</span>
                  {c.pipelineValue && (
                    <span className="text-xs text-zinc-400">Pipeline{formatCurrency(c.pipelineValue)}</span>
                  )}
                </label>
              )
            })}
          </div>
        </section>
      )}

      {/* Attendees section */}
      {filteredAttendees.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 pb-1 border-b border-zinc-200">
            Attendees {sub && sub.selectedAttendeeIds.length > 0 && (
              <span className="font-normal text-zinc-400">({sub.selectedAttendeeIds.length} selected)</span>
            )}
          </h2>
          <div className="space-y-1">
            {filteredAttendees.map(a => {
              const isSelected = sub?.selectedAttendeeIds.includes(a.id) ?? false
              return (
                <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection('attendee', a.id, isSelected)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                  />
                  <span className="text-sm text-zinc-900 flex-1">{a.name}</span>
                  <span className="text-xs text-zinc-400">{a.title}{a.companyName ? ` · ${a.companyName}` : ''}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {search && filteredAttendees.length === 0 && filteredCompanies.length === 0 && filteredEvents.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-8">No results for &quot;{search}&quot;</p>
      )}
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

**Step 2: Check the attendees/companies/events API response shapes**

The UI maps response data. Verify the actual shapes returned by:
- `GET /api/attendees` — check if it returns `{ attendees: [...] }` or `[...]` directly
- `GET /api/companies` — same
- `GET /api/events` — same

Adjust the mapping in the `useEffect` if needed (the code handles both array and `{ items: [...] }` shapes via `?? data`).

**Step 3: Verify in browser**

Navigate to `/intelligence/subscribe`. Confirm:
- All three sections render with entities
- Search filters across sections
- Checking an entity calls the API and increments `subscriptionCount` in DB
- Subscribe toggle is disabled initially if nothing is selected
- Subscribe toggle enables after first selection

**Step 4: Commit**

```bash
git add app/intelligence/subscribe/page.tsx
git commit -m "feat: replace subscription UI with explicit entity selection page"
```

---

## Task 11: Update System Export

**Files:**
- Modify: `app/api/admin/system/export/route.ts`

**Step 1: Add intelligenceSubscriptions to export payload**

After the `const settings = await prisma.systemSettings.findFirst()` line, add:

```typescript
const intelligenceSubscriptions = await prisma.intelligenceSubscription.findMany({
  include: {
    selectedAttendees: { select: { attendeeId: true } },
    selectedCompanies: { select: { companyId: true } },
    selectedEvents:    { select: { eventId: true } },
  },
})
```

Update the `exportData` object:

```typescript
const exportData = {
  systemSettings: settings,
  companies: companies,
  attendees: Array.from(attendeeMap.values()),
  events: normalizedEvents,
  intelligenceSubscriptions: intelligenceSubscriptions.map(s => ({
    id: s.id,
    userId: s.userId,
    email: s.email,
    active: s.active,
    unsubscribeToken: s.unsubscribeToken,
    selectedAttendeeIds: s.selectedAttendees.map(r => r.attendeeId),
    selectedCompanyIds:  s.selectedCompanies.map(r => r.companyId),
    selectedEventIds:    s.selectedEvents.map(r => r.eventId),
  })),
  exportedAt: new Date().toISOString(),
  version: '5.0-simplified-roi'
}
```

**Step 2: Verify**

```bash
curl -s http://localhost:3000/api/admin/system/export \
  -H "Cookie: <root-user-session>" | jq '.intelligenceSubscriptions'
```

Expected: array (empty if no subscriptions, or populated).

**Step 3: Commit**

```bash
git add app/api/admin/system/export/route.ts
git commit -m "feat: include intelligence subscriptions in system export"
```

---

## Task 12: Update System Import

**Files:**
- Modify: `app/api/admin/system/import/route.ts`

**Step 1: Add subscription restore + count recompute after event restoration**

At the end of the main `try` block (after the events loop, before `return NextResponse.json({ success: true })`), add:

```typescript
// 5. Restore Intelligence Subscriptions
if (json.intelligenceSubscriptions && Array.isArray(json.intelligenceSubscriptions)) {
  for (const s of json.intelligenceSubscriptions) {
    // Upsert subscription record
    await prisma.intelligenceSubscription.upsert({
      where: { userId: s.userId },
      create: {
        id: s.id,
        userId: s.userId,
        email: s.email,
        active: s.active ?? true,
        unsubscribeToken: s.unsubscribeToken ?? undefined,
      },
      update: {
        email: s.email,
        active: s.active ?? true,
      },
    }).catch(e => console.warn('IntelligenceSubscription import skip', e))

    const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId: s.userId } })
    if (!sub) continue

    // Restore attendee selections (skip missing IDs)
    if (s.selectedAttendeeIds) {
      for (const attendeeId of s.selectedAttendeeIds) {
        const exists = await prisma.attendee.findUnique({ where: { id: attendeeId } })
        if (!exists) continue
        await prisma.intelligenceSubAttendee.upsert({
          where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId } },
          create: { subscriptionId: sub.id, attendeeId },
          update: {},
        }).catch(() => {})
      }
    }

    // Restore company selections
    if (s.selectedCompanyIds) {
      for (const companyId of s.selectedCompanyIds) {
        const exists = await prisma.company.findUnique({ where: { id: companyId } })
        if (!exists) continue
        await prisma.intelligenceSubCompany.upsert({
          where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId } },
          create: { subscriptionId: sub.id, companyId },
          update: {},
        }).catch(() => {})
      }
    }

    // Restore event selections
    if (s.selectedEventIds) {
      for (const eventId of s.selectedEventIds) {
        const exists = await prisma.event.findUnique({ where: { id: eventId } })
        if (!exists) continue
        await prisma.intelligenceSubEvent.upsert({
          where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } },
          create: { subscriptionId: sub.id, eventId },
          update: {},
        }).catch(() => {})
      }
    }
  }

  // Recompute subscriptionCounts from scratch (count junction rows)
  const attendeeCounts = await prisma.intelligenceSubAttendee.groupBy({
    by: ['attendeeId'],
    _count: { attendeeId: true },
  })
  for (const row of attendeeCounts) {
    await prisma.attendee.update({
      where: { id: row.attendeeId },
      data: { subscriptionCount: row._count.attendeeId },
    }).catch(() => {})
  }
  // Zero out attendees not in junction table
  await prisma.attendee.updateMany({
    where: { id: { notIn: attendeeCounts.map(r => r.attendeeId) } },
    data: { subscriptionCount: 0 },
  })

  const companyCounts = await prisma.intelligenceSubCompany.groupBy({
    by: ['companyId'],
    _count: { companyId: true },
  })
  for (const row of companyCounts) {
    await prisma.company.update({
      where: { id: row.companyId },
      data: { subscriptionCount: row._count.companyId },
    }).catch(() => {})
  }
  await prisma.company.updateMany({
    where: { id: { notIn: companyCounts.map(r => r.companyId) } },
    data: { subscriptionCount: 0 },
  })

  const eventCounts = await prisma.intelligenceSubEvent.groupBy({
    by: ['eventId'],
    _count: { eventId: true },
  })
  for (const row of eventCounts) {
    await prisma.event.update({
      where: { id: row.eventId },
      data: { subscriptionCount: row._count.eventId },
    }).catch(() => {})
  }
  await prisma.event.updateMany({
    where: { id: { notIn: eventCounts.map(r => r.eventId) } },
    data: { subscriptionCount: 0 },
  })
}
```

**Step 2: Verify**

Export the system (Task 11), then POST the export JSON to import. Verify subscriptions and counts are restored correctly via `npx prisma studio`.

**Step 3: Commit**

```bash
git add app/api/admin/system/import/route.ts
git commit -m "feat: restore intelligence subscriptions and recompute counts in system import"
```

---

## Task 13: Event-Level Export Endpoint

**Files:**
- Create: `app/api/events/[id]/export/route.ts`

**Step 1: Create the file**

```typescript
// app/api/events/[id]/export/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

async function handleGET(_req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
  const { id: rawId } = await ctx.params

  const event = await prisma.event.findFirst({
    where: { OR: [{ id: rawId }, { slug: rawId }] },
    include: {
      rooms: true,
      meetings: {
        include: {
          attendees: { select: { id: true } },
          room: { select: { id: true } },
        },
      },
      attendees: true,
      roiTargets: { include: { targetCompanies: true } },
    },
  })

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Normalize meetings
  const normalizedMeetings = event.meetings.map(m => {
    const { attendees, room, ...rest } = m
    return { ...rest, attendees: attendees.map(a => a.id) }
  })

  // Normalize ROI targets
  const roiTargets = event.roiTargets ? (() => {
    const { targetCompanies, ...rest } = event.roiTargets
    return { ...rest, targetCompanyIds: targetCompanies.map(c => c.id) }
  })() : null

  // Find subscriptions that reference this event's entities
  const eventAttendeeIds = event.attendees.map(a => a.id)

  const relatedSubs = await prisma.intelligenceSubscription.findMany({
    where: {
      OR: [
        { selectedEvents: { some: { eventId: event.id } } },
        { selectedAttendees: { some: { attendeeId: { in: eventAttendeeIds } } } },
      ],
    },
    include: {
      selectedAttendees: { select: { attendeeId: true } },
      selectedCompanies: { select: { companyId: true } },
      selectedEvents: { select: { eventId: true } },
    },
  })

  const subscriptions = relatedSubs.map(s => ({
    userId: s.userId,
    email: s.email,
    active: s.active,
    selectedAttendeeIds: s.selectedAttendees
      .map(r => r.attendeeId)
      .filter(id => eventAttendeeIds.includes(id)),
    selectedCompanyIds: s.selectedCompanies.map(r => r.companyId),
    selectedEventIds: s.selectedEvents
      .map(r => r.eventId)
      .filter(id => id === event.id),
  }))

  return NextResponse.json({
    event: {
      ...event,
      rooms: undefined,
      meetings: undefined,
      attendees: undefined,
      roiTargets: undefined,
      attendeeIds: event.attendees.map(a => a.id),
    },
    rooms: event.rooms,
    meetings: normalizedMeetings,
    attendees: event.attendees,
    roiTargets,
    intelligenceSubscriptions: subscriptions,
    exportedAt: new Date().toISOString(),
  })
}

export const GET = withAuth(handleGET, { requireRole: 'write' }) as any
```

**Step 2: Verify**

```bash
# Get an event ID from the DB
EVENT_ID="<event-id-or-slug>"
curl -s http://localhost:3000/api/events/$EVENT_ID/export \
  -H "Cookie: <root-session>" | jq '.intelligenceSubscriptions'
```

Expected: JSON export with subscriptions scoped to this event's entities.

**Step 3: Commit**

```bash
git add app/api/events/[id]/export/route.ts
git commit -m "feat: add event-level export endpoint with scoped subscription data"
```

---

## Task 14: Event-Level Import Endpoint

**Files:**
- Create: `app/api/events/[id]/import/route.ts`

**Step 1: Create the file**

```typescript
// app/api/events/[id]/import/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, type AuthContext } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

async function handlePOST(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
  const json = await req.json()
  const { event: evtData, rooms, meetings, attendees, roiTargets, intelligenceSubscriptions } = json

  if (!evtData?.id) {
    return NextResponse.json({ error: 'event.id required' }, { status: 400 })
  }

  // Upsert event
  await prisma.event.upsert({
    where: { id: evtData.id },
    create: {
      id: evtData.id,
      name: evtData.name,
      slug: evtData.slug || evtData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + evtData.id.slice(-5),
      startDate: evtData.startDate,
      endDate: evtData.endDate,
      status: evtData.status || 'PIPELINE',
      tags: evtData.tags || [],
      meetingTypes: evtData.meetingTypes || [],
      attendeeTypes: evtData.attendeeTypes || [],
      authorizedUserIds: evtData.authorizedUserIds || [],
    },
    update: {
      name: evtData.name,
      startDate: evtData.startDate,
      endDate: evtData.endDate,
      status: evtData.status,
    },
  })

  const eventId = evtData.id

  // Upsert rooms
  if (rooms) {
    for (const r of rooms) {
      await prisma.room.upsert({
        where: { id: r.id },
        create: { id: r.id, name: r.name, capacity: r.capacity, eventId },
        update: { name: r.name, capacity: r.capacity },
      }).catch(e => console.warn('Room skip', e))
    }
  }

  // Upsert attendees and connect to event
  if (attendees) {
    for (const a of attendees) {
      if (!a.companyId) continue
      await prisma.attendee.upsert({
        where: { id: a.id },
        create: {
          id: a.id, name: a.name, email: a.email, title: a.title,
          companyId: a.companyId, bio: a.bio, linkedin: a.linkedin,
          imageUrl: a.imageUrl, isExternal: a.isExternal, type: a.type,
          seniorityLevel: a.seniorityLevel,
          events: { connect: { id: eventId } },
        },
        update: { events: { connect: { id: eventId } } },
      }).catch(e => console.warn('Attendee skip', e))
    }
  }

  // Upsert meetings
  if (meetings) {
    for (const m of meetings) {
      const attendeeConnects = (m.attendees ?? []).map((id: string) => ({ id }))
      await prisma.meeting.upsert({
        where: { id: m.id },
        create: {
          id: m.id, title: m.title, date: m.date, startTime: m.startTime,
          endTime: m.endTime, eventId, roomId: m.roomId,
          attendees: { connect: attendeeConnects },
          sequence: m.sequence || 0, status: m.status || 'PIPELINE',
          tags: m.tags || [],
        },
        update: {
          title: m.title, date: m.date, startTime: m.startTime,
          endTime: m.endTime, status: m.status,
          attendees: { set: attendeeConnects },
        },
      }).catch(e => console.warn('Meeting skip', e))
    }
  }

  // Restore intelligence subscriptions scoped to this event
  if (intelligenceSubscriptions && Array.isArray(intelligenceSubscriptions)) {
    const eventAttendeeIds = (attendees ?? []).map((a: any) => a.id)

    for (const s of intelligenceSubscriptions) {
      let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId: s.userId } })
      if (!sub) {
        sub = await prisma.intelligenceSubscription.create({
          data: { userId: s.userId, email: s.email, active: s.active ?? true },
        }).catch(() => null)
      }
      if (!sub) continue

      // Restore event selection
      for (const eid of (s.selectedEventIds ?? [])) {
        if (eid !== eventId) continue
        await prisma.intelligenceSubEvent.upsert({
          where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId: eid } },
          create: { subscriptionId: sub.id, eventId: eid },
          update: {},
        }).catch(() => {})
      }

      // Restore attendee selections (only those in this event)
      for (const aid of (s.selectedAttendeeIds ?? [])) {
        if (!eventAttendeeIds.includes(aid)) continue
        const exists = await prisma.attendee.findUnique({ where: { id: aid } })
        if (!exists) continue
        await prisma.intelligenceSubAttendee.upsert({
          where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId: aid } },
          create: { subscriptionId: sub.id, attendeeId: aid },
          update: {},
        }).catch(() => {})
      }
    }

    // Recompute subscriptionCounts for entities in this event
    const attendeeIds = (attendees ?? []).map((a: any) => a.id)
    for (const aid of attendeeIds) {
      const count = await prisma.intelligenceSubAttendee.count({ where: { attendeeId: aid } })
      await prisma.attendee.update({ where: { id: aid }, data: { subscriptionCount: count } }).catch(() => {})
    }
    const eventCount = await prisma.intelligenceSubEvent.count({ where: { eventId } })
    await prisma.event.update({ where: { id: eventId }, data: { subscriptionCount: eventCount } }).catch(() => {})
  }

  return NextResponse.json({ success: true, message: 'Event imported successfully' })
}

export const POST = withAuth(handlePOST, { requireRole: 'write' }) as any
```

**Step 2: Verify**

Export an event (Task 13), then POST the JSON to the import endpoint for the same event. Confirm subscriptions are re-attached and counts are correct.

**Step 3: Commit**

```bash
git add app/api/events/[id]/import/route.ts
git commit -m "feat: add event-level import endpoint with subscription restore"
```

---

## Task 15: Final Verification

**Step 1: Build check**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

**Step 2: End-to-end smoke test**

1. Navigate to `/intelligence/subscribe` — confirm all three sections load
2. Select 2 companies, 1 attendee, 1 event → verify subscribe toggle enables
3. Toggle subscribe ON → verify `IntelligenceSubscription.active = true` in Prisma Studio
4. Call `GET /api/intelligence/targets` with Bearer token → confirm selected entities appear
5. POST a test webhook payload with matching target name → confirm personalized email sent
6. Confirm root user received aggregate email

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete intelligence subscription refactor to explicit selection model"
```
