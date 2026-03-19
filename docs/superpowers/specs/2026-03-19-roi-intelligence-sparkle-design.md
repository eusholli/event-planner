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

## Data Flow

### Phase 1 — Marketing Plan Generation

**Trigger:** Event card sparkle click, or as an automatic fallback when a ROI page sparkle is clicked and no plan exists.

**Steps:**
1. Check if `EventROITargets.marketingPlan` is already populated for the event.
2. If **populated**: skip generation. Navigate to `/events/[id]/roi?planWarning=1`.
3. If **empty**: call `POST /api/events/[id]/roi/generate-plan`.
   - Fetches full event details from DB.
   - Calls `@google/generative-ai` with `googleSearch` tool enabled (same pattern as `lib/actions/event.ts`).
   - Prompt instructs Gemini to produce:
     - A 30-day pre-event marketing timeline
     - A 15-day post-event follow-up plan
     - A list of target companies, each with: name, industry/description, and reason for attending
     - Draft budget and ROI metric estimates (expectedPipeline, winRate, targetCustomerMeetings, targetErta, targetSpeaking, targetMediaPR)
   - Saves the resulting markdown to `EventROITargets.marketingPlan` (upserts ROI record if none exists).
   - Returns `{ marketingPlan: string }`.
4. Navigate to `/events/[id]/roi` (on success) or `/events/[id]/roi?planError=1` (on failure).

### Phase 2 — ROI Value Extraction

**Trigger:** User clicks a section sparkle on the ROI Dashboard Targets tab.

**Steps:**
1. If `marketingPlan` is empty, silently run Phase 1 first (spinner on sparkle icon), then continue.
2. Call `POST /api/events/[id]/roi/extract-roi`.
   - Reads `marketingPlan` from DB.
   - Calls Gemini **without** web search (extraction only — cheaper and faster).
   - Returns structured JSON: `{ budget, expectedPipeline, winRate, targetCustomerMeetings, targetErta, targetSpeaking, targetMediaPR, targetCompanies: [{ name, description }] }`.
3. Show inline confirmation panel:
   - *"X fields will be filled · Y already have values and will be skipped"* — **Apply** / **Cancel**
4. On confirm: apply values to form state only. User must still click **Save Targets** to persist.

---

## API Routes

### `POST /api/events/[id]/roi/generate-plan`

- Auth: `requireRole: write`, `requireEventAccess: true`
- Calls `generateMarketingPlan(eventId)` server action
- Returns: `{ marketingPlan: string }`
- Errors: 400 if Gemini API key not configured; 500 on generation failure

### `POST /api/events/[id]/roi/extract-roi`

- Auth: `requireRole: write`, `requireEventAccess: true`
- Calls `extractROIValues(eventId)` server action
- Returns: `{ budget, expectedPipeline, winRate, targetCustomerMeetings, targetErta, targetSpeaking, targetMediaPR, targetCompanies: [{ name, description }] }`
- Errors: 400 if no marketing plan exists; 500 on extraction failure

---

## Server Actions (`lib/actions/roi-generate.ts`)

### `buildEventContext(event): string`

Extracts the event data fields into a structured markdown block (name, dates, timezone, region, address, url, booth, description, tags, targetCustomers, budget). Replaces the `buildMarketingPrompt` function that was in `app/events/page.tsx`.

### `generateMarketingPlan(eventId): Promise<string>`

- Fetches event + system settings (Gemini API key)
- Builds prompt using `buildEventContext`
- Prompt asks for:
  - 30-day pre-event marketing timeline with concrete actions
  - 15-day post-event follow-up plan
  - Target companies section: each company gets name, short description (industry, focus), and reason for attending
  - Draft ROI estimates with brief justification
- Calls Gemini 2.5 Pro with `googleSearch` tool
- Upserts `EventROITargets.marketingPlan`
- Returns the plan text

### `extractROIValues(eventId): Promise<ROIDraft>`

- Reads `EventROITargets.marketingPlan` from DB; throws if empty
- Calls Gemini (no search) with a structured extraction prompt
- Returns `ROIDraft` type: `{ budget, expectedPipeline, winRate, targetCustomerMeetings, targetErta, targetSpeaking, targetMediaPR, targetCompanies: [{ name, description }] }`

---

## UI Changes

### Event Card Sparkle (`app/events/page.tsx`)

**Before:** Builds prompt string → writes to `sessionStorage.intelligenceAutoQuery` → navigates to `/intelligence?eventId=...`

**After:**
1. Fetch `/api/events/[id]/roi` to read `marketingPlan`
2. If empty: call `POST .../generate-plan` (spinner active), then navigate to `/events/[id]/roi`
3. If populated: navigate immediately to `/events/[id]/roi?planWarning=1`
4. If generation fails: navigate to `/events/[id]/roi?planError=1`

Remove: `buildMarketingPrompt` function, `sessionStorage` write, `/intelligence` navigation.

### ROI Dashboard — Targets Tab (`app/events/[id]/roi/page.tsx`)

**Query param handling on mount:** Read `planWarning` and `planError` from URL search params, set appropriate `message` state (amber / red), clear the params from the URL.

**Three sparkle entry points** (visible only when `canEdit && !isLocked`):

#### Financial Targets section
- Amber `Sparkles` icon in the section header row (right-aligned)
- Tooltip: *"Fill empty financial fields from marketing plan"*
- On click: call `extract-roi` → show inline confirmation panel → on Apply, fill `budget`, `expectedPipeline`, `winRate`, `targetCustomerMeetings` (skip non-null fields)

#### Event Targets section
- Same placement and pattern
- Tooltip: *"Fill empty event target fields from marketing plan"*
- On click: fill `targetCustomerMeetings`, `targetErta`, `targetSpeaking`, `targetMediaPR`

#### Target Companies section
- Sparkle button in section header
- Tooltip: *"Add suggested target companies from marketing plan"*
- On click: call `extract-roi`, show checkable list of suggested companies not already in `targetCompanies` (pre-checked)
- User confirms → for each checked company: check `availableCompanies` state first; if not found, call `POST /api/companies` to create with name + description from plan; then add to `targetCompanies` state

**Inline confirmation panel** (shared pattern for Financial + Event Targets):
```
┌─────────────────────────────────────────────────────┐
│  ✦  3 fields will be filled                         │
│     1 already has a value and will be skipped       │
│                          [Cancel]  [Apply]          │
└─────────────────────────────────────────────────────┘
```
Styled consistent with existing section cards (white/70 backdrop, zinc border, rounded-2xl).

**Sparkle loading state:** spinner replaces the `Sparkles` icon while the API call is in progress (same pattern as event card).

---

## Company Resolution

When applying target companies from the plan:

1. Check `availableCompanies` (already fetched in page state from `/api/companies`)
2. If not found: `POST /api/companies` with `{ name, description }` from the plan
3. Add newly created company to `availableCompanies` state and to `targetCompanies`
4. Re-uses the same `resolveCompany` logic already in `lib/actions/event.ts` on the server side

---

## Error & Edge Cases

| Scenario | Behaviour |
|---|---|
| Gemini API key not configured | Red error bar: *"Gemini API key not configured in System Settings"* |
| Plan generation fails (Gemini error) | Navigate to ROI page with `?planError=1`, red error bar |
| Marketing plan already exists (event card sparkle) | Navigate to ROI page with `?planWarning=1`, amber warning bar |
| ROI sparkle clicked, no plan → generate-plan also fails | Red error bar on ROI page |
| ROI is locked (`APPROVED` status) | Sparkle buttons hidden (same guard as edit fields) |
| User is not `root` or `marketing` | Sparkle buttons hidden (`canEdit` guard) |

---

## Files

### New
- `app/api/events/[id]/roi/generate-plan/route.ts`
- `app/api/events/[id]/roi/extract-roi/route.ts`
- `lib/actions/roi-generate.ts`

### Modified
- `app/events/page.tsx` — replace sparkle handler, remove `buildMarketingPrompt`
- `app/events/[id]/roi/page.tsx` — query param handling, three sparkle buttons, confirmation panel, company creation

### Unchanged
- `lib/actions/roi.ts`
- `lib/actions/event.ts` (resolveCompany reused)
- `prisma/schema.prisma` (no schema changes needed)
