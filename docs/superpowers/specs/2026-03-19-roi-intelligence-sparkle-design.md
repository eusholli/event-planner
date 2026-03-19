# ROI Intelligence Sparkle — Design Spec

**Date:** 2026-03-19
**Branch:** multi-event
**Status:** Approved

---

## Overview

Add AI-powered sparkle buttons to the Event ROI Dashboard that extract draft ROI values from a Gemini-generated marketing plan. Simultaneously, replace the existing event card sparkle's OpenClaw/intelligence chat flow with a direct Gemini call that generates the marketing plan and navigates the user to the ROI page. The `/intelligence` page is no longer used for marketing plan generation; it remains the hub for conversational company/people research and scheduled intelligence reports.

---

## Goals

1. Event card sparkle generates a marketing plan via Gemini (with web search) and navigates to the ROI Dashboard.
2. ROI Dashboard has section-level sparkle buttons that extract draft values from the saved marketing plan.
3. Target companies suggested by the plan are auto-created in the DB if they don't already exist, using the description from the plan.
4. The user's manually-edited marketing plan is never silently overwritten.

---

## Role & Permission Model

The sparkle buttons follow the same `canEdit` guard already on the ROI page:

```typescript
const canEdit = role === 'root' || role === 'marketing'
```

**`admin` role is explicitly excluded.** ROI targets are a marketing/finance management concern. Admins have write access to event data (meetings, attendees) but not to ROI budgets and financial targets. This is a deliberate product decision, not an oversight. The sparkle buttons are hidden for `admin` users.

All new API routes use `requireRole: write` (same as existing ROI routes), which permits root/admin/marketing — the stricter `canEdit` guard is enforced in the UI layer only.

---

## Data Flow

### Phase 1 — Marketing Plan Generation

**Trigger:** Event card sparkle click, or as an automatic fallback when a ROI page sparkle is clicked and no plan exists.

**Steps:**
1. Client checks if `EventROITargets.marketingPlan` is already populated for the event.
2. If **populated**: skip generation entirely. Navigate to `/events/[id]/roi?planWarning=1`.
3. If **empty**: call `POST /api/events/[id]/roi/generate-plan`.
   - Server checks again whether `marketingPlan` is already populated (idempotency guard — prevents race condition if two tabs/users click simultaneously). If it finds an existing plan, returns `{ marketingPlan: string, skipped: true }` without overwriting.
   - If empty, fetches full event details from DB.
   - Calls `@google/generative-ai` with `googleSearch` tool enabled (same pattern as `lib/actions/event.ts`).
   - Prompt instructs Gemini to produce (see Prompt Design section below):
     - A 30-day pre-event marketing timeline
     - A 15-day post-event follow-up plan
     - A target companies section: each company gets name, short description (industry/focus), and reason for attending
     - Draft ROI metric estimates: expectedPipeline, winRate, targetCustomerMeetings, targetErta, targetSpeaking, targetMediaPR, and a suggested budget
   - Saves the resulting markdown to `EventROITargets.marketingPlan` (upserts the ROI record if none exists).
   - Returns `{ marketingPlan: string, skipped: false }`.
4. On success: navigate to `/events/[id]/roi`.
5. On failure: navigate to `/events/[id]/roi?planError=1`.

### Phase 2 — ROI Value Extraction

**Trigger:** User clicks a section sparkle on the ROI Dashboard Targets tab.

**Steps:**
1. If `marketingPlan` is empty in local state, silently run Phase 1 first:
   - Show spinner on the sparkle icon.
   - Call `POST /api/events/[id]/roi/generate-plan`.
   - On success: update `targets.marketingPlan` in local state, then automatically proceed to extraction (no second user click required).
   - On failure: show red error bar inline on the page. Do not re-navigate. Stop.
2. Call `POST /api/events/[id]/roi/extract-roi`.
   - Returns structured draft values. Does not write to DB.
3. Show inline confirmation panel (see UI section). User reviews, then clicks **Apply** or **Cancel**.
4. On Apply: merge suggested values into form state only. User must still click **Save Targets** to persist.

---

## API Routes

### `POST /api/events/[id]/roi/generate-plan`

- Auth: `requireRole: write`, `requireEventAccess: true`
- Server-side idempotency: if `marketingPlan` already exists, return `{ marketingPlan, skipped: true }` without calling Gemini
- Calls `generateMarketingPlan(eventId)` server action
- Returns: `{ marketingPlan: string, skipped: boolean }`
- Errors: 400 if Gemini API key not configured in SystemSettings; 500 on generation failure
- Timeout: set `export const maxDuration = 120` (Gemini with web search can be slow)

### `POST /api/events/[id]/roi/extract-roi`

- Auth: `requireRole: write`, `requireEventAccess: true`
- Returns 400 if `marketingPlan` is empty (client must call generate-plan first)
- Calls `extractROIValues(eventId)` server action
- Returns: `{ budget, expectedPipeline, winRate, targetCustomerMeetings, targetErta, targetSpeaking, targetMediaPR, targetCompanies: [{ name, description }] }`
- Note: `requesterEmail` is intentionally excluded — AI should not guess an email address
- Note: `budget` and `requesterEmail` are stored on the `Event` model (not `EventROITargets`) by `saveROITargets` — the split is handled transparently by that action; the UI treats them as regular ROI form fields

---

## Server Actions (`lib/actions/roi-generate.ts`)

### `buildEventContext(event): string`

Extracts event data fields into a structured markdown block: name, dates, timezone, region, address, url, booth, description, tags, targetCustomers, budget. Replaces the `buildMarketingPrompt` function that was in `app/events/page.tsx`.

### `generateMarketingPlan(eventId): Promise<string>`

- Fetches event details + system settings (Gemini API key from `SystemSettings.geminiApiKey`)
- Builds context using `buildEventContext`
- Prompt:
  - Persona: "You are a B2B event marketing strategist helping Rakuten Symphony..."
    - **Code comment**: `// TODO: pull company name from SystemSettings once that field is added`
  - Explicitly requests:
    1. 30-day pre-event marketing timeline with concrete weekly actions
    2. 15-day post-event follow-up plan
    3. **Target Companies** section — for each company: `name`, `description` (industry, focus area, 1–2 sentences), `reason` (why they'd attend this event)
    4. Draft ROI estimates: budget, expectedPipeline, winRate, targetCustomerMeetings, targetErta (%), targetSpeaking, targetMediaPR — each with a brief rationale
  - Instructs model to use clearly labelled `##` headings for each section so Phase 2 extraction is reliable
- Calls Gemini with `googleSearch` tool enabled
- Upserts `EventROITargets.marketingPlan` with the result
- Returns the plan text (markdown)

### `extractROIValues(eventId): Promise<ROIDraft>`

- Reads `EventROITargets.marketingPlan` from DB; throws 400-equivalent if empty
- Calls Gemini **without** web search (extraction only)
- Structured extraction prompt: given the plan text, extract the specified fields as JSON
- Returns `ROIDraft`:
  ```typescript
  interface ROIDraft {
    budget: number | null
    expectedPipeline: number | null
    winRate: number | null           // decimal, e.g. 0.15
    targetCustomerMeetings: number | null
    targetErta: number | null        // decimal percentage, e.g. 15
    targetSpeaking: number | null
    targetMediaPR: number | null
    targetCompanies: Array<{ name: string; description: string }>
  }
  // Note: requesterEmail is intentionally excluded
  ```

---

## Prompt Design

The new prompt is richer than the old `buildMarketingPrompt` (which was designed as a chat opener for OpenClaw). Key differences:

- Old prompt: passes event data, lets OpenClaw figure out the task implicitly
- New prompt: explicitly instructs output structure with `##` section headings, so Phase 2 extraction is deterministic
- New prompt includes company description requirement (name + industry + reason to attend) — this populates the DB `description` field when companies are auto-created
- Draft ROI numbers are requested with brief justifications, so the marketing plan reads as a coherent document rather than a data dump

---

## UI Changes

### Event Card Sparkle (`app/events/page.tsx`)

**Before:** Builds prompt string → writes to `sessionStorage.intelligenceAutoQuery` → navigates to `/intelligence?eventId=...`

**After:**
1. Fetch `/api/events/[id]/roi` to check `targets.marketingPlan`
2. If empty: call `POST .../generate-plan` (spinner active), then navigate to `/events/[id]/roi`
3. If populated: navigate immediately to `/events/[id]/roi?planWarning=1`
4. If generation fails: navigate to `/events/[id]/roi?planError=1`

Remove: `buildMarketingPrompt` function, `sessionStorage.intelligenceAutoQuery` write, `/intelligence` navigation.

Note: `sessionStorage.intelligenceAutoQuery` is still written by `MeetingCard.tsx` and the attendees page (for OpenClaw company/person research). `IntelligenceChat.tsx` is unchanged — only the event card sparkle's write is removed.

### ROI Dashboard — Targets Tab (`app/events/[id]/roi/page.tsx`)

**Query param handling on mount:**
- Use `useSearchParams()` from `next/navigation` (requires wrapping the page — or the params-reading logic — in a `Suspense` boundary per Next.js App Router requirements)
- Read `planWarning` and `planError` on mount, set `message` state, then call `router.replace` to strip the params from the URL
- If user refreshes before the effect clears params, the message re-appears — acceptable behaviour

**Three sparkle entry points** (visible only when `canEdit && !isLocked`):

#### Financial Targets section
- Amber `Sparkles` icon in the section header row (right-aligned, consistent with event card style)
- Tooltip: *"Fill empty financial fields from marketing plan"*
- Fields filled: `budget`, `expectedPipeline`, `winRate`
- Fields intentionally excluded: `targetCustomerMeetings` (belongs to Event Targets), `requesterEmail` (AI should not guess)
- On click: run extraction flow → show confirmation panel → on Apply, merge non-null suggested values into form state (skip fields already populated)

#### Event Targets section
- Same placement and pattern
- Tooltip: *"Fill empty event target fields from marketing plan"*
- Fields filled: `targetCustomerMeetings`, `targetErta`, `targetSpeaking`, `targetMediaPR`

#### Target Companies section
- Sparkle button in section header
- Tooltip: *"Add suggested target companies from marketing plan"*
- Behaviour differs from field-fill sparkles (see below)

**Inline confirmation panel** (Financial Targets + Event Targets):

```
┌─────────────────────────────────────────────────────┐
│  ✦  3 fields will be filled                         │
│     1 already has a value and will be skipped       │
│                          [Cancel]  [Apply]          │
└─────────────────────────────────────────────────────┘
```

Styled consistent with existing section cards (white/70 backdrop, zinc border, rounded-2xl). Shown inline below the section header, not as a modal.

**Target Companies sparkle flow:**
1. Call `extract-roi` to get `targetCompanies: [{ name, description }]`
2. Filter out companies already in `targets.targetCompanies`
3. Show a checkable list panel:
   ```
   ┌──────────────────────────────────────────────────────────┐
   │  ✦  5 companies suggested · 2 already in your targets   │
   │                                                          │
   │  ☑  Acme Corp — Cloud infrastructure provider           │
   │  ☑  Beta Inc — Enterprise SaaS platform                 │
   │  ☑  Gamma Ltd — Telecom equipment manufacturer          │
   │                          [Cancel]  [Add Selected]       │
   └──────────────────────────────────────────────────────────┘
   ```
4. On **Add Selected**:
   - For each checked company: check `availableCompanies` state (fetched on mount from `/api/companies`)
   - If found: use existing record
   - If not found: call `POST /api/companies` with `{ name, description }`
     - If 409 (duplicate — stale `availableCompanies` state): treat as success, fetch the existing company via `GET /api/companies` filtered by name, use its `id`
   - Add all resolved companies to `targets.targetCompanies` state
   - Add newly created companies to `availableCompanies` state

**Sparkle loading state:** spinner replaces the `Sparkles` icon while any API call is in progress (same SVG spinner pattern as event card).

**No-plan fallback:** if `marketingPlan` is empty when any ROI sparkle is clicked, the sparkle runs Phase 1 inline (spinner), updates `targets.marketingPlan` in state on success, then auto-proceeds to extraction. If Phase 1 fails, shows red error bar inline — no re-navigation (user is already on the ROI page).

---

## Error & Edge Cases

| Scenario | Behaviour |
|---|---|
| Gemini API key not configured | Red error bar: *"Gemini API key not configured in System Settings"* |
| Plan generation fails (Gemini error) | Event card: navigate to ROI page with `?planError=1`, red error bar. ROI page inline: red error bar, no navigation |
| Marketing plan already exists (event card sparkle) | Navigate to ROI page with `?planWarning=1`, amber warning bar: *"An existing marketing plan was found — no new plan was generated"* |
| generate-plan called server-side when plan exists | Return `{ marketingPlan, skipped: true }` — no Gemini call, no overwrite |
| extract-roi called with no marketing plan | Return 400 — client handles by running Phase 1 first |
| ROI sparkle clicked, Phase 1 fallback also fails | Red error bar inline on ROI page |
| `POST /api/companies` returns 409 (stale state) | Treat as success: fetch existing company by name, use its id |
| ROI is locked (`APPROVED` status) | Sparkle buttons hidden (same `isLocked` guard as edit fields) |
| User role is `admin` | Sparkle buttons hidden (`canEdit` requires root or marketing) |
| User refreshes ROI page with `?planWarning=1` in URL | Warning bar re-appears — acceptable; clears on next render cycle |

---

## Files

### New
- `app/api/events/[id]/roi/generate-plan/route.ts` — Phase 1 endpoint (`maxDuration = 120`)
- `app/api/events/[id]/roi/extract-roi/route.ts` — Phase 2 endpoint
- `lib/actions/roi-generate.ts` — `buildEventContext`, `generateMarketingPlan`, `extractROIValues`

### Modified
- `app/events/page.tsx` — replace sparkle handler, remove `buildMarketingPrompt`
- `app/events/[id]/roi/page.tsx` — `useSearchParams` + Suspense, three sparkle buttons, inline confirmation panels, company creation on confirm

### Unchanged
- `lib/actions/roi.ts` — `saveROITargets`, `getROITargets` etc. untouched
- `lib/actions/event.ts` — `resolveCompany` reused as-is
- `components/IntelligenceChat.tsx` — still reads `sessionStorage.intelligenceAutoQuery` for MeetingCard and attendee sparkles
- `prisma/schema.prisma` — no schema changes needed
