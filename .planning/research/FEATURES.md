# Feature Research

**Domain:** Event status lifecycle — adding AWARENESS status to Event Planner
**Researched:** 2026-03-17
**Confidence:** HIGH (all findings from direct codebase inspection)

## Feature Landscape

### Table Stakes (Users Expect These)

Every place that displays or filters by event status must include AWARENESS or the UI will be inconsistent and confusing.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `lib/status-colors.ts` — add AWARENESS entry | Single source of truth; `EventStatus` type is derived from this map; all badge rendering flows through `getStatusColor()` | LOW | Add `AWARENESS` key with blue colors (#3b82f6); reassign OCCURRED to grey/slate. `getStatusColor()` already handles unknowns via fallback so no structural change needed. |
| `app/events/page.tsx` — status filter checkbox list | Users filter their portfolio by status; a missing checkbox silently hides all AWARENESS events | LOW | Two hardcoded arrays: (1) `useState` default at line 40 initializes to `['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']`; (2) Clear Filters reset at line 191 restores same list. Both must include `'AWARENESS'`. |
| `app/events/page.tsx` — filter sidebar `[...].map(status => ...)` | The status checkbox loop at line 257 iterates over a hardcoded array; AWARENESS must be in the array | LOW | Same hardcoded array as the `useState` default. One place to fix renders all filter checkboxes. |
| `app/events/page.tsx` — event card status badge | Every event card renders `getStatusColor(event.status).className` for the badge and `.bg` for the left-border accent stripe | LOW | Automatically handled once `lib/status-colors.ts` is updated; no additional code change required. |
| `app/events/page.tsx` — event detail modal status badge | Modal header shows `getStatusColor(selectedEvent.status).className` badge | LOW | Automatically handled via `getStatusColor`. |
| `app/events/page.tsx` — `handleViewDashboard` access gate | Line 130–134: `if (canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED')` — without this change, AWARENESS events cannot be accessed by non-managers | MEDIUM | Decide whether AWARENESS grants dashboard access. Per PROJECT.md "AWARENESS events are fully editable," suggesting they should be accessible. Recommend adding `'AWARENESS'` to the gate condition. |
| `app/events/page.tsx` — modal "View Dashboard" button visibility | Line 561: same gate as above, rendered as JSX condition — must match `handleViewDashboard` logic | LOW | Same change as above; keep in sync. |
| `app/events/[id]/settings/page.tsx` — status `<select>` dropdown | The select at line 418–422 has four hardcoded `<option>` elements: PIPELINE, COMMITTED, OCCURRED, CANCELED. AWARENESS must be added | LOW | Add `<option value="AWARENESS">Awareness</option>` before Pipeline per the required display order. |
| `app/events/[id]/settings/page.tsx` — `isLocked` check | Line 279: `const isLocked = event?.status === 'OCCURRED'`. AWARENESS must NOT be locked (PROJECT.md: "AWARENESS events are fully editable") | LOW | No change needed; AWARENESS is not OCCURRED, so it is already writable. Confirm no other hardcoded lock checks exist. |
| `app/events/[id]/settings/page.tsx` — read-only warning banner | Line 296–308: banner shown when `isLocked`. Since AWARENESS is not OCCURRED, this requires no change | LOW | Verify banner text still makes sense for the remaining statuses it will display for. |
| `app/events/[id]/dashboard/page.tsx` — `isLocked` check | Line 103: `if (eventData.status === 'OCCURRED') setIsLocked(true)`. Meetings status filter in sidebar (line 720) also has a hardcoded array `['PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED']` — that is **MeetingStatus**, not EventStatus; no change needed for it | LOW | Event-level lock check is already safe for AWARENESS. Confirm no AWARENESS-specific dashboard restrictions are needed. |
| `app/events/[id]/attendees/page.tsx` — `isLocked` check | Line 140: `if (eventData.status === 'OCCURRED') setIsLocked(true)`. AWARENESS events must remain editable | LOW | No change needed; AWARENESS will not trigger the lock. Confirm no other event-status checks exist in this file. |
| `app/events/[id]/calendar/page.tsx` — `isLocked` check | Line 146: same `eventData.status === 'OCCURRED'` pattern | LOW | No change needed for AWARENESS. |
| `app/api/events/[id]/route.ts` — PATCH lock check | Line 92–102: blocks writes when `currentEvent.status === 'OCCURRED'` unless transitioning away. AWARENESS must not trigger this lock | LOW | No change needed; the lock is specifically for OCCURRED. |
| `app/api/events/[id]/route.ts` — DELETE lock check | Line 189: `if (existing.status === 'OCCURRED')` blocks deletion. AWARENESS events must be deletable | LOW | No change needed; AWARENESS is not OCCURRED. |
| `app/api/events/route.ts` — POST default status | Line 84: `status: json.status || 'PIPELINE'`. New events default to PIPELINE; AWARENESS is only set if explicitly passed | LOW | No change required; existing default is appropriate. |
| `components/reports/EventMap.tsx` — map marker color | Line 78: `const colors = getStatusColor(event.status)` drives `fillColor` and `color` for each marker | LOW | Automatically handled once `lib/status-colors.ts` is updated. |
| `components/reports/EventCalendar.tsx` — timeline bar color | Line 118: `const colors = getStatusColor(event.status)` drives `backgroundColor`, `borderColor`, `color` for each event bar | LOW | Automatically handled once `lib/status-colors.ts` is updated. |
| `app/intelligence/subscribe/page.tsx` — event status badge in subscribed list | Lines 285–288 and 364–367: inline status badge uses a hardcoded conditional: `e.status === 'CONFIRMED'` (green) / `e.status === 'CANCELED'` (red) / fallback grey. Note: checks for `'CONFIRMED'` — a MeetingStatus value, not a valid EventStatus. AWARENESS would currently render as grey fallback | LOW | The badge logic is independent of `EVENT_STATUS_COLORS`. If visual consistency matters, add `e.status === 'AWARENESS'` → blue styling here. Not functionally broken without it; just cosmetically inconsistent. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Display order: AWARENESS → PIPELINE → COMMITTED → CANCELED → OCCURRED | Logical lifecycle ordering surfaces prospective events before active ones; OCCURRED sinks to the bottom as historical | LOW | Affects: (1) settings `<select>` option order, (2) status filter checkbox order in `app/events/page.tsx`. No backend ordering required — the filter is client-side. |
| AWARENESS events fully editable (no read-only lock) | Users can iterate on early-stage events without artificial friction | LOW | Already satisfied by the existing `status === 'OCCURRED'` lock pattern; AWARENESS gets full editability by default. |
| OCCURRED color change from blue → grey/slate | Frees blue for AWARENESS; semantically grey = historical/done | LOW | Change in `lib/status-colors.ts` only. All consumers pick up the new color automatically via `getStatusColor()`. Must audit any hardcoded `text-blue-*` or `bg-blue-*` Tailwind classes that may have been written to match OCCURRED's current color. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Forced AWARENESS → PIPELINE state transition validation | Might seem like a useful guardrail to prevent skipping stages | PROJECT.md explicitly states "All status transitions allowed (no forced flow)"; adding guards creates friction and contradicts user intent | Leave transitions free; rely on visual status labels to communicate stage |
| Prisma enum migration for status | Seems like the "correct" DB modeling | Status is stored as `String` in the schema with `@default("PIPELINE")`; no DB constraint enforces valid values, so no enum migration is needed | Add AWARENESS to `lib/status-colors.ts` only; run a simple DB migration only if a check constraint exists (none found in schema) |
| Making AWARENESS events read-only in sub-pages | Might seem consistent with OCCURRED lock pattern | Contradicts the explicit requirement that AWARENESS events are fully editable | Apply read-only lock exclusively to OCCURRED status, as currently implemented |

## Feature Dependencies

```
lib/status-colors.ts (add AWARENESS, recolor OCCURRED)
    └──required by──> app/events/page.tsx badge rendering (automatic)
    └──required by──> components/reports/EventMap.tsx marker color (automatic)
    └──required by──> components/reports/EventCalendar.tsx bar color (automatic)

app/events/page.tsx filter array update
    └──required by──> selectedStatuses default state (line 40)
    └──required by──> Clear Filters reset (line 191)
    └──required by──> filter sidebar checkbox list (line 257)
    └──required by──> handleViewDashboard access gate (line 130)
    └──required by──> modal View Dashboard button condition (line 561)

app/events/[id]/settings/page.tsx <select> option update
    └──standalone──> no downstream dependency; editors set status here
```

### Dependency Notes

- **`lib/status-colors.ts` is the root dependency:** All badge and map/calendar color rendering flows through `getStatusColor()`. Update this file first; UI components downstream require no direct changes.
- **Filter arrays are duplicated in three locations within `app/events/page.tsx`:** The `useState` initializer, the Clear Filters handler, and the checkbox `.map()` call all hardcode the status list. All three must be updated atomically.
- **`app/intelligence/subscribe/page.tsx` status badge is independent:** It does not use `getStatusColor()`; it uses an inline conditional. It is not broken by the AWARENESS addition, but will show AWARENESS events with a grey badge instead of blue. Update separately if visual consistency is required.
- **Lock checks require no change:** Every event-level lock check in the codebase tests `status === 'OCCURRED'` specifically. AWARENESS events are automatically writable.

## MVP Definition

### Launch With (v1 — this milestone)

- [x] `lib/status-colors.ts` — add AWARENESS (blue), reassign OCCURRED to grey/slate — **root change, unblocks everything**
- [x] `app/events/page.tsx` — add AWARENESS to all three hardcoded status arrays (state default, Clear Filters reset, checkbox map)
- [x] `app/events/page.tsx` — add AWARENESS to `handleViewDashboard` and modal button access gate
- [x] `app/events/[id]/settings/page.tsx` — add AWARENESS option to status `<select>`, in position before PIPELINE

### Add After Validation (v1.x)

- [ ] `app/intelligence/subscribe/page.tsx` — align status badge styling for AWARENESS (blue) to match `EVENT_STATUS_COLORS`; currently renders grey fallback which is functional but cosmetically inconsistent

### Future Consideration (v2+)

- [ ] Extract all hardcoded status arrays across the codebase into a single shared constant derived from `EVENT_STATUS_COLORS` keys — eliminates the need to update multiple files when statuses change in future

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `lib/status-colors.ts` AWARENESS entry + OCCURRED recolor | HIGH — blocks all visual consistency | LOW | P1 |
| `app/events/page.tsx` filter arrays (3 locations) | HIGH — AWARENESS events invisible in portfolio without this | LOW | P1 |
| `app/events/page.tsx` dashboard access gate | HIGH — non-manager users cannot open AWARENESS events without this | LOW | P1 |
| `app/events/[id]/settings/page.tsx` status select | HIGH — cannot set status to AWARENESS via UI without this | LOW | P1 |
| `app/intelligence/subscribe/page.tsx` badge color | LOW — functional without it; only cosmetic | LOW | P2 |
| Shared status constant refactor | MEDIUM — reduces future maintenance | MEDIUM | P3 |

## Sources

- Direct codebase inspection: `/Users/eusholli/dev/event-planner/lib/status-colors.ts`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/events/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/events/[id]/settings/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/events/[id]/dashboard/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/events/[id]/attendees/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/events/[id]/calendar/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/events/[id]/new-meeting/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/events/[id]/reports/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/api/events/route.ts`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/api/events/[id]/route.ts`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/api/meetings/route.ts`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/api/meetings/[id]/route.ts`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/api/webhooks/intel-report/route.ts`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/app/intelligence/subscribe/page.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/components/reports/EventMap.tsx`
- Direct codebase inspection: `/Users/eusholli/dev/event-planner/components/reports/EventCalendar.tsx`
- Project requirements: `/Users/eusholli/dev/event-planner/.planning/PROJECT.md`

---
*Feature research for: AWARENESS event status addition to Event Planner*
*Researched: 2026-03-17*
