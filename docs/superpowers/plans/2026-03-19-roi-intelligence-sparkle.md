# ROI Intelligence Sparkle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered sparkle buttons to the ROI Dashboard that generate a marketing plan via Gemini and extract draft ROI field values from it, replacing the existing OpenClaw chat flow for marketing plan generation.

**Architecture:** A two-phase Gemini approach — Phase 1 (`generate-plan`) calls Gemini with web search to produce a marketing plan and save it to the DB; Phase 2 (`extract-roi`) reads that plan and extracts structured ROI values. The event card sparkle is updated to use Phase 1 instead of navigating to `/intelligence`. Three sparkle buttons are added to the ROI page Targets tab.

**Tech Stack:** Next.js 16 App Router, `@google/generative-ai` (already installed), Prisma/PostgreSQL, Tailwind CSS v4, Clerk auth via `withAuth` HOC, TypeScript.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/actions/roi-generate.ts` | **Create** | `buildEventContext`, `generateMarketingPlan`, `extractROIValues`, `ROIDraft` type |
| `app/api/events/[id]/roi/generate-plan/route.ts` | **Create** | Phase 1 API endpoint (POST) |
| `app/api/events/[id]/roi/extract-roi/route.ts` | **Create** | Phase 2 API endpoint (POST) |
| `app/events/page.tsx` | **Modify** | Replace sparkle handler; remove `buildMarketingPrompt` |
| `app/events/[id]/roi/page.tsx` | **Modify** | Query param handling; three sparkle buttons; confirmation panels |

---

## Task 1: Create `lib/actions/roi-generate.ts`

**Files:**
- Create: `lib/actions/roi-generate.ts`

This file contains all Gemini logic. It never touches the HTTP layer.

- [ ] **Step 1: Create the file with the `buildEventContext` helper and `ROIDraft` type**

```typescript
'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface ROIDraft {
    budget: number | null
    expectedPipeline: number | null
    winRate: number | null           // decimal e.g. 0.15 for 15%
    targetCustomerMeetings: number | null
    targetErta: number | null        // decimal percentage e.g. 15 for 15%
    targetSpeaking: number | null
    targetMediaPR: number | null
    targetCompanies: Array<{ name: string; description: string }>
    // requesterEmail intentionally excluded — AI should not guess an email address
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function buildEventContext(event: {
    name: string
    startDate: Date | null
    endDate: Date | null
    timezone: string | null
    region: string | null
    address: string | null
    url: string | null
    boothLocation: string | null
    description: string | null
    tags: string[]
    targetCustomers: string | null
    budget: number | null
}): string {
    const lines: string[] = ['## Event Details', '']

    const add = (label: string, value: string | null | undefined) => {
        if (value != null && value !== '') lines.push(`- **${label}:** ${value}`)
    }

    add('Name', event.name)

    if (event.startDate || event.endDate) {
        const start = event.startDate ? event.startDate.toISOString().split('T')[0] : 'TBD'
        const end = event.endDate ? event.endDate.toISOString().split('T')[0] : 'TBD'
        const tz = event.timezone ? ` (${event.timezone})` : ''
        lines.push(`- **Dates:** ${start} – ${end}${tz}`)
    }

    add('Region', event.region)
    add('Location', event.address)
    add('Website', event.url)
    add('Booth', event.boothLocation)
    add('Description', event.description)

    if (event.tags && event.tags.length > 0) {
        lines.push(`- **Themes/Tags:** ${event.tags.join(', ')}`)
    }

    add('Target Customers', event.targetCustomers)

    if (event.budget) {
        lines.push(`- **Budget:** $${event.budget.toLocaleString()}`)
    }

    return lines.join('\n')
}
```

- [ ] **Step 2: Add `generateMarketingPlan` — Phase 1 Gemini call**

Append to `lib/actions/roi-generate.ts`:

```typescript
// -----------------------------------------------------------------------
// Phase 1: Generate marketing plan (Gemini + web search)
// -----------------------------------------------------------------------

export async function generateMarketingPlan(eventId: string): Promise<string> {
    const [event, settings] = await Promise.all([
        prisma.event.findUnique({
            where: { id: eventId },
            select: {
                name: true, startDate: true, endDate: true, timezone: true,
                region: true, address: true, url: true, boothLocation: true,
                description: true, tags: true, targetCustomers: true, budget: true,
            }
        }),
        prisma.systemSettings.findFirst(),
    ])

    if (!event) throw new Error('Event not found')

    const apiKey = settings?.geminiApiKey
    if (!apiKey) throw new Error('Gemini API key not configured in System Settings')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro-preview-05-06',
        // @ts-ignore — googleSearch tool typing not yet in SDK types
        tools: [{ googleSearch: {} }],
    })

    // TODO: pull company name from SystemSettings once that field is added
    const companyName = 'Rakuten Symphony'

    const context = buildEventContext(event)

    const prompt = `You are a B2B event marketing strategist helping ${companyName} plan their attendance at the following event. Use Google Search to find the latest publicly available information about this event.

${context}

Please produce a comprehensive marketing plan with the following clearly labelled sections using ## headings:

## 30-Day Pre-Event Marketing Plan
A week-by-week timeline of concrete marketing actions starting 30 days before the event (outreach, content, social, internal prep, logistics, meeting scheduling, etc.).

## 15-Day Post-Event Follow-Up Plan
A day-by-day or week-by-week timeline of follow-up actions for 15 days after the event ends (lead follow-up, content publishing, pipeline updates, internal debrief, etc.).

## Target Companies
List the 10–15 companies most likely to attend this event and most valuable for ${companyName} to engage. For each company provide:
- **Name:** [company name]
- **Description:** [1–2 sentence description of the company: industry, focus area, size]
- **Reason to Engage:** [why they attend this event and why they are a priority for ${companyName}]

## Draft ROI Targets
Suggest realistic draft values for each of the following metrics, with a brief rationale for each:
- **Budget:** estimated total event attendance cost in USD
- **Expected Pipeline:** estimated total pipeline value in USD that could be generated
- **Win Rate:** estimated close rate as a decimal (e.g. 0.15 for 15%)
- **Target Customer Meetings:** target number of customer/prospect meetings
- **Target ERTA:** target Engagement Rate from Targeted Accounts as a percentage (e.g. 15 for 15%)
- **Target Speaking:** target number of speaking slots/panels to secure
- **Target Media/PR:** target number of media interviews or press mentions`

    const result = await model.generateContent(prompt)
    const planText = result.response.text()

    // Save to DB — upsert so this works whether or not an ROI record exists yet
    await prisma.eventROITargets.upsert({
        where: { eventId },
        create: { event: { connect: { id: eventId } }, marketingPlan: planText },
        update: { marketingPlan: planText },
    })

    return planText
}
```

- [ ] **Step 3: Add `extractROIValues` — Phase 2 Gemini call**

Append to `lib/actions/roi-generate.ts`:

```typescript
// -----------------------------------------------------------------------
// Phase 2: Extract structured ROI values from existing marketing plan
// -----------------------------------------------------------------------

export async function extractROIValues(eventId: string): Promise<ROIDraft> {
    const [roiRecord, settings] = await Promise.all([
        prisma.eventROITargets.findUnique({
            where: { eventId },
            select: { marketingPlan: true },
        }),
        prisma.systemSettings.findFirst(),
    ])

    const marketingPlan = roiRecord?.marketingPlan
    if (!marketingPlan) {
        throw new Error('No marketing plan found for this event. Generate one first.')
    }

    const apiKey = settings?.geminiApiKey
    if (!apiKey) throw new Error('Gemini API key not configured in System Settings')

    const genAI = new GoogleGenerativeAI(apiKey)
    // No web search needed for extraction — just parsing the existing plan text
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `You are a data extraction assistant. Read the following event marketing plan and extract the specified values.

Return ONLY a valid JSON object — no markdown, no backticks, no explanation.

Marketing Plan:
---
${marketingPlan}
---

Extract these fields from the "Draft ROI Targets" section of the plan:
- budget (number in USD, integer, or null if not found)
- expectedPipeline (number in USD, integer, or null if not found)
- winRate (decimal number e.g. 0.15 for 15%, or null if not found)
- targetCustomerMeetings (integer, or null if not found)
- targetErta (number as percentage value e.g. 15 for 15%, or null if not found)
- targetSpeaking (integer, or null if not found)
- targetMediaPR (integer, or null if not found)

Extract these fields from the "Target Companies" section:
- targetCompanies: array of objects, each with:
  - name (string)
  - description (string — the 1-2 sentence company description)

JSON format:
{
  "budget": 50000,
  "expectedPipeline": 2000000,
  "winRate": 0.15,
  "targetCustomerMeetings": 20,
  "targetErta": 15,
  "targetSpeaking": 3,
  "targetMediaPR": 2,
  "targetCompanies": [
    { "name": "Acme Corp", "description": "Cloud infrastructure provider focused on enterprise customers." }
  ]
}`

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    // Robust JSON extraction — strip markdown if Gemini adds it
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim()

    // Find the JSON object boundaries
    const firstOpen = cleanText.indexOf('{')
    const lastClose = cleanText.lastIndexOf('}')
    const jsonStr = firstOpen !== -1 && lastClose !== -1
        ? cleanText.substring(firstOpen, lastClose + 1)
        : cleanText

    return JSON.parse(jsonStr) as ROIDraft
}
```

- [ ] **Step 4: Verify lint passes**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|lib/actions/roi-generate"
```

Expected: no errors in the new file.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/roi-generate.ts
git commit -m "feat: add generateMarketingPlan and extractROIValues server actions"
```

---

## Task 2: Create Phase 1 API route

**Files:**
- Create: `app/api/events/[id]/roi/generate-plan/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server'
import { resolveEventId } from '@/lib/events'
import { generateMarketingPlan } from '@/lib/actions/roi-generate'
import { withAuth } from '@/lib/with-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // Gemini with web search can be slow

const POSTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        // Server-side idempotency guard — never overwrite an existing plan
        const existing = await prisma.eventROITargets.findUnique({
            where: { eventId: id },
            select: { marketingPlan: true },
        })

        if (existing?.marketingPlan) {
            return NextResponse.json({ marketingPlan: existing.marketingPlan, skipped: true })
        }

        const marketingPlan = await generateMarketingPlan(id)
        return NextResponse.json({ marketingPlan, skipped: false })

    } catch (error: any) {
        console.error('Error generating marketing plan:', error)
        const msg = error.message || 'Failed to generate marketing plan'
        const status = msg.includes('not configured') ? 400 : 500
        return NextResponse.json({ error: msg }, { status })
    }
}, { requireRole: 'write', requireEventAccess: true })

export const POST = POSTHandler as any
```

- [ ] **Step 2: Verify lint**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|generate-plan"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/events/\[id\]/roi/generate-plan/route.ts
git commit -m "feat: add POST /api/events/[id]/roi/generate-plan endpoint"
```

---

## Task 3: Create Phase 2 API route

**Files:**
- Create: `app/api/events/[id]/roi/extract-roi/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server'
import { resolveEventId } from '@/lib/events'
import { extractROIValues } from '@/lib/actions/roi-generate'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

const POSTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const draft = await extractROIValues(id)
        return NextResponse.json(draft)

    } catch (error: any) {
        console.error('Error extracting ROI values:', error)
        const msg = error.message || 'Failed to extract ROI values'
        const status = msg.includes('No marketing plan') ? 400
            : msg.includes('not configured') ? 400
                : 500
        return NextResponse.json({ error: msg }, { status })
    }
}, { requireRole: 'write', requireEventAccess: true })

export const POST = POSTHandler as any
```

- [ ] **Step 2: Verify lint**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|extract-roi"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/events/\[id\]/roi/extract-roi/route.ts
git commit -m "feat: add POST /api/events/[id]/roi/extract-roi endpoint"
```

---

## Task 4: Update event card sparkle in `app/events/page.tsx`

**Files:**
- Modify: `app/events/page.tsx`

The current sparkle handler (around line 450) builds a prompt, writes to `sessionStorage`, and navigates to `/intelligence`. Replace it entirely. Also remove the `buildMarketingPrompt` function (lines 47–115 approx) and the `EventDetail` interface if it's only used there (check first).

- [ ] **Step 1: Remove `buildMarketingPrompt` and the `EventDetail` interface**

Find and delete the `buildMarketingPrompt` function and the `EventDetail` interface from `app/events/page.tsx`. They span approximately lines 29–115. The `EventDetail` interface is only used as the type for the result of the `/api/events/${event.id}` fetch inside the sparkle handler — it will be replaced.

- [ ] **Step 2: Replace the sparkle button click handler**

Find the sparkle button's `onClick` handler (currently ~line 450, inside the event card). Replace the entire `onClick` async function body with:

```typescript
onClick={async (e) => {
    e.stopPropagation()
    setSparkleLoadingId(event.id)
    try {
        // Check if a marketing plan already exists for this event
        const roiRes = await fetch(`/api/events/${event.id}/roi`)
        const roiData = roiRes.ok ? await roiRes.json() : {}
        const hasPlan = !!(roiData.targets?.marketingPlan)

        if (hasPlan) {
            // Navigate to ROI page — warn that existing plan was preserved
            router.push(`/events/${event.slug || event.id}/roi?planWarning=1`)
        } else {
            // Generate the plan, then navigate to ROI page
            const genRes = await fetch(`/api/events/${event.id}/roi/generate-plan`, {
                method: 'POST',
            })
            if (genRes.ok) {
                router.push(`/events/${event.slug || event.id}/roi`)
            } else {
                router.push(`/events/${event.slug || event.id}/roi?planError=1`)
            }
        }
    } catch {
        router.push(`/events/${event.slug || event.id}/roi?planError=1`)
    } finally {
        setSparkleLoadingId(null)
    }
}}
```

- [ ] **Step 3: Verify lint**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|events/page"
```

- [ ] **Step 4: Smoke test in browser**

Start dev server (`npm run dev`). Go to `/events`. Click the sparkle on an event card with no existing marketing plan. Verify:
- Spinner shows
- After generation, lands on `/events/[id]/roi` (Targets tab)
- Marketing Plan textarea is populated

Click sparkle on same event again. Verify:
- Navigates immediately to `/events/[id]/roi?planWarning=1`
- Amber message bar appears: plan was preserved

- [ ] **Step 5: Commit**

```bash
git add app/events/page.tsx
git commit -m "feat: update event card sparkle to use Gemini and navigate to ROI page"
```

---

## Task 5: ROI page — query param handling + shared sparkle infrastructure

**Files:**
- Modify: `app/events/[id]/roi/page.tsx`

This task wires up the query param reading and adds the shared state needed by all three sparkles. The actual sparkle buttons are added in Tasks 6–8.

- [ ] **Step 1: Add imports**

At the top of `app/events/[id]/roi/page.tsx`, add to the existing import block:

```typescript
import { useSearchParams, useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
```

(`useRouter` may already be imported — check first and skip if so. `Sparkles` is the amber sparkle icon from lucide-react.)

- [ ] **Step 2: Add `useSearchParams` and query param handling**

Inside `ROIPage()`, after the existing `const [message, setMessage] = useState('')` line, add:

```typescript
const searchParams = useSearchParams()
const router = useRouter()

// Read planWarning / planError from URL on mount, show message, clear params
useEffect(() => {
    const warning = searchParams.get('planWarning')
    const error = searchParams.get('planError')
    if (warning) {
        setMessage('An existing marketing plan was found — no new plan was generated.')
        router.replace(window.location.pathname)
    } else if (error) {
        setMessage('Failed to generate marketing plan. Please try again or type one manually.')
        router.replace(window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

Note: `useSearchParams()` in Next.js 13+ App Router requires the component (or an ancestor) to be wrapped in `<Suspense>`. The ROI page is rendered inside `app/events/[id]/layout.tsx` — check if it already has a Suspense boundary. If not, wrap the `<ROIPage />` call in `app/events/[id]/roi/page.tsx` export with a `<Suspense fallback={null}>`.

The simplest approach: export a wrapper as the default:

```typescript
import { Suspense } from 'react'

function ROIPage() {
    // ... existing component body ...
}

export default function ROIPageWrapper() {
    return (
        <Suspense fallback={null}>
            <ROIPage />
        </Suspense>
    )
}
```

- [ ] **Step 3: Add sparkle shared state**

After the existing state declarations in `ROIPage()`, add:

```typescript
// Sparkle state
const [sparkleLoading, setSparkleLoading] = useState<'financial' | 'events' | 'companies' | null>(null)
const [confirmPanel, setConfirmPanel] = useState<{
    section: 'financial' | 'events' | 'companies'
    draft: import('@/lib/actions/roi-generate').ROIDraft
} | null>(null)
```

- [ ] **Step 4: Add the shared `runExtraction` helper function**

Inside `ROIPage()`, before the `return` statement, add:

```typescript
// Runs Phase 1 (if no plan) then Phase 2, returns the draft or null on error
const runExtraction = async (section: 'financial' | 'events' | 'companies') => {
    setSparkleLoading(section)
    setMessage('')
    try {
        // If no marketing plan yet, generate one first
        if (!targets.marketingPlan) {
            const genRes = await fetch(`/api/events/${eventId}/roi/generate-plan`, { method: 'POST' })
            if (!genRes.ok) {
                const err = await genRes.json()
                setMessage(err.error || 'Failed to generate marketing plan.')
                return null
            }
            const genData = await genRes.json()
            setTargets(prev => ({ ...prev, marketingPlan: genData.marketingPlan }))
        }

        // Extract ROI values from the plan
        const extractRes = await fetch(`/api/events/${eventId}/roi/extract-roi`, { method: 'POST' })
        if (!extractRes.ok) {
            const err = await extractRes.json()
            setMessage(err.error || 'Failed to extract ROI values from marketing plan.')
            return null
        }
        return await extractRes.json()
    } catch {
        setMessage('An unexpected error occurred. Please try again.')
        return null
    } finally {
        setSparkleLoading(null)
    }
}
```

- [ ] **Step 5: Verify lint**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|roi/page"
```

- [ ] **Step 6: Commit**

```bash
git add app/events/\[id\]/roi/page.tsx
git commit -m "feat: add sparkle infrastructure and query param handling to ROI page"
```

---

## Task 6: Financial Targets sparkle button

**Files:**
- Modify: `app/events/[id]/roi/page.tsx`

- [ ] **Step 1: Add sparkle button to the Financial Targets section header**

Find the Financial Targets `<section>` (the one with `bg-indigo-500` accent and `<h3>Financial Targets</h3>`). Replace its `<h3>` line with:

```tsx
<h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
    <span className="w-1 h-5 bg-indigo-500 rounded-full" />
    Financial Targets
    {canEdit && !isLocked && (
        <button
            onClick={async () => {
                const draft = await runExtraction('financial')
                if (draft) setConfirmPanel({ section: 'financial', draft })
            }}
            disabled={sparkleLoading === 'financial'}
            title="Fill empty financial fields from marketing plan"
            className="ml-auto p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
            {sparkleLoading === 'financial' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            ) : (
                <Sparkles className="w-4 h-4" />
            )}
        </button>
    )}
</h3>
```

- [ ] **Step 2: Add the inline confirmation panel for Financial Targets**

Immediately after the closing `</div>` of the Financial Targets grid (the one with `grid-cols-1 md:grid-cols-2 lg:grid-cols-5`), add:

```tsx
{confirmPanel?.section === 'financial' && (() => {
    const draft = confirmPanel.draft
    const toFill = [
        !targets.budget && draft.budget != null,
        !targets.expectedPipeline && draft.expectedPipeline != null,
        !targets.winRate && draft.winRate != null,
    ].filter(Boolean).length
    const toSkip = [
        !!targets.budget,
        !!targets.expectedPipeline,
        !!targets.winRate,
    ].filter(Boolean).length
    return (
        <div className="mt-4 p-4 bg-white/70 backdrop-blur-sm border border-amber-200 rounded-2xl shadow-sm flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-700">
                <span className="font-medium text-amber-600">✦ {toFill} field{toFill !== 1 ? 's' : ''} will be filled</span>
                {toSkip > 0 && <span className="text-zinc-500"> · {toSkip} already ha{toSkip !== 1 ? 've' : 's'} a value and will be skipped</span>}
            </div>
            <div className="flex gap-2 shrink-0">
                <button onClick={() => setConfirmPanel(null)}
                    className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors">
                    Cancel
                </button>
                <button onClick={() => {
                    if (draft.budget != null && !targets.budget) setTargets(prev => ({ ...prev, budget: draft.budget }))
                    if (draft.expectedPipeline != null && !targets.expectedPipeline) setTargets(prev => ({ ...prev, expectedPipeline: draft.expectedPipeline }))
                    if (draft.winRate != null && !targets.winRate) setTargets(prev => ({ ...prev, winRate: draft.winRate }))
                    setConfirmPanel(null)
                    setMessage('Financial targets updated — remember to save.')
                }}
                    className="px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors font-medium">
                    Apply
                </button>
            </div>
        </div>
    )
})()}
```

- [ ] **Step 3: Verify lint**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|roi/page"
```

- [ ] **Step 4: Smoke test**

Start dev server. Navigate to an event's ROI page. On the Targets tab, verify:
- Sparkle icon appears in Financial Targets header (right-aligned)
- Clicking it (with no marketing plan) shows spinner, generates plan, then shows confirmation panel
- Panel counts filled/skipped correctly
- Cancel closes the panel, Apply fills form fields and shows a toast
- Clicking sparkle when plan already exists goes straight to confirmation panel

- [ ] **Step 5: Commit**

```bash
git add app/events/\[id\]/roi/page.tsx
git commit -m "feat: add Financial Targets sparkle button to ROI page"
```

---

## Task 7: Event Targets sparkle button

**Files:**
- Modify: `app/events/[id]/roi/page.tsx`

- [ ] **Step 1: Add sparkle button to Event Targets section header**

Find the Event Targets `<section>` (the one with `bg-violet-500` accent). Replace its `<h3>` with:

```tsx
<h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
    <span className="w-1 h-5 bg-violet-500 rounded-full" />
    Event Targets
    {canEdit && !isLocked && (
        <button
            onClick={async () => {
                const draft = await runExtraction('events')
                if (draft) setConfirmPanel({ section: 'events', draft })
            }}
            disabled={sparkleLoading === 'events'}
            title="Fill empty event target fields from marketing plan"
            className="ml-auto p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
            {sparkleLoading === 'events' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            ) : (
                <Sparkles className="w-4 h-4" />
            )}
        </button>
    )}
</h3>
```

- [ ] **Step 2: Add inline confirmation panel for Event Targets**

Immediately after the closing `</div>` of the Event Targets grid (the one with `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`), add:

```tsx
{confirmPanel?.section === 'events' && (() => {
    const draft = confirmPanel.draft
    const toFill = [
        !targets.targetCustomerMeetings && draft.targetCustomerMeetings != null,
        !targets.targetErta && draft.targetErta != null,
        !targets.targetSpeaking && draft.targetSpeaking != null,
        !targets.targetMediaPR && draft.targetMediaPR != null,
    ].filter(Boolean).length
    const toSkip = [
        !!targets.targetCustomerMeetings,
        !!targets.targetErta,
        !!targets.targetSpeaking,
        !!targets.targetMediaPR,
    ].filter(Boolean).length
    return (
        <div className="mt-4 p-4 bg-white/70 backdrop-blur-sm border border-amber-200 rounded-2xl shadow-sm flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-700">
                <span className="font-medium text-amber-600">✦ {toFill} field{toFill !== 1 ? 's' : ''} will be filled</span>
                {toSkip > 0 && <span className="text-zinc-500"> · {toSkip} already ha{toSkip !== 1 ? 've' : 's'} a value and will be skipped</span>}
            </div>
            <div className="flex gap-2 shrink-0">
                <button onClick={() => setConfirmPanel(null)}
                    className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors">
                    Cancel
                </button>
                <button onClick={() => {
                    if (draft.targetCustomerMeetings != null && !targets.targetCustomerMeetings) setTargets(prev => ({ ...prev, targetCustomerMeetings: draft.targetCustomerMeetings }))
                    if (draft.targetErta != null && !targets.targetErta) setTargets(prev => ({ ...prev, targetErta: draft.targetErta }))
                    if (draft.targetSpeaking != null && !targets.targetSpeaking) setTargets(prev => ({ ...prev, targetSpeaking: draft.targetSpeaking }))
                    if (draft.targetMediaPR != null && !targets.targetMediaPR) setTargets(prev => ({ ...prev, targetMediaPR: draft.targetMediaPR }))
                    setConfirmPanel(null)
                    setMessage('Event targets updated — remember to save.')
                }}
                    className="px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors font-medium">
                    Apply
                </button>
            </div>
        </div>
    )
})()}
```

- [ ] **Step 3: Verify lint and commit**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|roi/page"
git add app/events/\[id\]/roi/page.tsx
git commit -m "feat: add Event Targets sparkle button to ROI page"
```

---

## Task 8: Target Companies sparkle button

**Files:**
- Modify: `app/events/[id]/roi/page.tsx`

This sparkle has a different flow: it shows a checkable company list instead of a field-count confirmation panel.

- [ ] **Step 1: Add `companyChecklist` state**

In the state declarations of `ROIPage()`, add:

```typescript
const [companyChecklist, setCompanyChecklist] = useState<Array<{
    name: string
    description: string
    checked: boolean
    existingId: string | null  // null = will be created
}> | null>(null)
const [companySaving, setCompanySaving] = useState(false)
```

- [ ] **Step 2: Add sparkle button to Target Companies section header**

Find the Target Companies `<section>` (the one with `bg-teal-500` accent). Replace its `<h3>` with:

```tsx
<h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
    <span className="w-1 h-5 bg-teal-500 rounded-full" />
    Target Companies
    {canEdit && !isLocked && (
        <button
            onClick={async () => {
                const draft = await runExtraction('companies')
                if (!draft) return
                const suggested = (draft.targetCompanies || [])
                    .filter(c => !targets.targetCompanies.some(tc => tc.name.toLowerCase() === c.name.toLowerCase()))
                    .map(c => ({
                        name: c.name,
                        description: c.description,
                        checked: true,
                        existingId: availableCompanies.find(ac => ac.name.toLowerCase() === c.name.toLowerCase())?.id ?? null,
                    }))
                if (suggested.length === 0) {
                    setMessage('All suggested companies are already in your target list.')
                    return
                }
                setCompanyChecklist(suggested)
            }}
            disabled={sparkleLoading === 'companies'}
            title="Add suggested target companies from marketing plan"
            className="ml-auto p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
            {sparkleLoading === 'companies' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            ) : (
                <Sparkles className="w-4 h-4" />
            )}
        </button>
    )}
</h3>
```

- [ ] **Step 3: Add the company checklist panel**

Inside the Target Companies `<section>`, after the company search input block (the `ref={companyDropdownRef}` div), add:

```tsx
{companyChecklist && (
    <div className="mb-4 p-4 bg-white/70 backdrop-blur-sm border border-amber-200 rounded-2xl shadow-sm">
        <p className="text-sm font-medium text-zinc-700 mb-3">
            <span className="text-amber-600 font-semibold">✦ {companyChecklist.length} companies suggested</span>
            {targets.targetCompanies.length > 0 && (
                <span className="text-zinc-500"> · {targets.targetCompanies.length} already in your targets</span>
            )}
        </p>
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {companyChecklist.map((item, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => setCompanyChecklist(prev => prev!.map((c, j) =>
                            j === i ? { ...c, checked: !c.checked } : c
                        ))}
                        className="mt-0.5 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                        <span className="text-sm font-medium text-zinc-900 group-hover:text-teal-700">{item.name}</span>
                        {item.existingId === null && (
                            <span className="ml-2 text-xs text-amber-600 font-medium">new</span>
                        )}
                        {item.description && (
                            <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                        )}
                    </div>
                </label>
            ))}
        </div>
        <div className="flex gap-2">
            <button onClick={() => setCompanyChecklist(null)}
                className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors">
                Cancel
            </button>
            <button
                disabled={companySaving || companyChecklist.every(c => !c.checked)}
                onClick={async () => {
                    setCompanySaving(true)
                    const selected = companyChecklist.filter(c => c.checked)
                    const resolved: Array<{ id: string; name: string }> = []

                    for (const item of selected) {
                        if (item.existingId) {
                            resolved.push({ id: item.existingId, name: item.name })
                        } else {
                            // Try to create the company
                            const res = await fetch('/api/companies', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: item.name, description: item.description }),
                            })
                            if (res.ok) {
                                const created = await res.json()
                                resolved.push({ id: created.id, name: created.name })
                                setAvailableCompanies(prev => [...prev, created])
                            } else if (res.status === 409) {
                                // Already exists — fetch it
                                const listRes = await fetch(`/api/companies?query=${encodeURIComponent(item.name)}`)
                                if (listRes.ok) {
                                    const list = await listRes.json()
                                    const match = list.find((c: { name: string; id: string }) =>
                                        c.name.toLowerCase() === item.name.toLowerCase()
                                    )
                                    if (match) resolved.push({ id: match.id, name: match.name })
                                }
                            }
                            // If all else fails, skip this company silently
                        }
                    }

                    setTargets(prev => ({
                        ...prev,
                        targetCompanies: [
                            ...prev.targetCompanies,
                            ...resolved.filter(r => !prev.targetCompanies.some(tc => tc.id === r.id)),
                        ],
                    }))
                    setCompanyChecklist(null)
                    setCompanySaving(false)
                    setMessage(`${resolved.length} compan${resolved.length !== 1 ? 'ies' : 'y'} added — remember to save.`)
                }}
                className="px-3 py-1.5 text-sm bg-teal-600 text-white hover:bg-teal-700 rounded-lg transition-colors font-medium disabled:opacity-50">
                {companySaving ? 'Adding…' : 'Add Selected'}
            </button>
        </div>
    </div>
)}
```

- [ ] **Step 4: Verify lint**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint -- --max-warnings 0 2>&1 | grep -E "error|warning|roi/page"
```

- [ ] **Step 5: Smoke test**

On the ROI page Targets tab:
- Click the Target Companies sparkle. Verify checklist panel appears with suggested companies.
- Uncheck one company, click Add Selected. Verify only checked companies are added to the target list.
- Click sparkle again on an event with all companies already in targets. Verify "All suggested companies are already in your target list" message.
- Verify a company with `new` badge gets created in the DB (check via Prisma Studio: `npx prisma studio`).
- Verify 409 recovery: if a company already exists but wasn't in `availableCompanies`, it should still resolve correctly.

- [ ] **Step 6: Commit**

```bash
git add app/events/\[id\]/roi/page.tsx
git commit -m "feat: add Target Companies sparkle button to ROI page"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full lint check**

```bash
cd /Users/eusholli/dev/event-planner && npm run lint
```

Expected: no errors.

- [ ] **Step 2: Full end-to-end smoke test**

Complete walkthrough:
1. Go to `/events`, click sparkle on event with no marketing plan → spins → lands on ROI page → marketing plan textarea populated
2. Click sparkle on same event again → lands on ROI page with amber warning bar
3. On ROI page, click Financial Targets sparkle (plan exists) → confirmation panel with field counts → Apply → fields filled → Save Targets
4. Click Event Targets sparkle → same flow
5. Click Target Companies sparkle → checklist with new/existing badges → Add Selected → companies added to target list → Save Targets
6. Verify all changes persist after page reload

- [ ] **Step 3: Build check**

```bash
cd /Users/eusholli/dev/event-planner && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Final commit if any lint/build fixes were needed**

```bash
git add -p  # stage only the necessary changes
git commit -m "fix: address lint and build issues in ROI sparkle implementation"
```
