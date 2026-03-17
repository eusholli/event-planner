# Architecture Patterns

**Domain:** Event status lifecycle — adding AWARENESS status
**Researched:** 2026-03-17

## Event Status Data Flow

```
PostgreSQL (String field)
        |
        | prisma.event.findMany / findUnique / create / update
        v
Prisma Client (no enum — raw String passthrough)
        |
        | JSON serialization over HTTP
        v
Next.js API Routes (/api/events, /api/events/[id])
        |
        | status string flows into response body
        v
TypeScript types (EventStatus = keyof typeof EVENT_STATUS_COLORS)
        |
        | consumed by React components
        v
UI Layer (badges, filters, dropdowns, map markers, calendar colors)
```

### Key architectural fact

The `Event.status` field in `prisma/schema.prisma` is `String @default("PIPELINE")` — **not a Prisma enum**. There is no DB-level constraint on valid values beyond the default. This means:

- No Prisma enum migration is needed.
- The only migration required is a `npx prisma migrate dev` that touches nothing schema-structural — it is a no-op migration unless a CHECK constraint is manually added later.
- The real source of truth for valid statuses is `lib/status-colors.ts` → `EVENT_STATUS_COLORS`.

---

## Component Boundaries

| Layer | File(s) | Status Role |
|-------|---------|-------------|
| Source of truth | `lib/status-colors.ts` | Defines `EVENT_STATUS_COLORS` map and `EventStatus` type |
| Editability gate | `lib/events.ts` → `isEventEditable()` | Hardcoded allowlist of status strings that are NOT `OCCURRED` |
| API collection | `app/api/events/route.ts` | `POST`: accepts `json.status`, defaults to `'PIPELINE'` |
| API item | `app/api/events/[id]/route.ts` | `PATCH`: OCCURRED lock check; COMMITTED validation; DELETE blocks OCCURRED |
| API consumers | `app/api/meetings/route.ts`, `app/api/meetings/[id]/route.ts`, `app/api/rooms/route.ts`, `app/api/rooms/[id]/route.ts`, `app/api/attendees/route.ts`, `app/api/attendees/[id]/route.ts`, `app/api/events/[id]/import/route.ts`, `app/api/events/[id]/reset/route.ts` | All call `isEventEditable()` to gate writes |
| Events list page | `app/events/page.tsx` | Status filter checkboxes (hardcoded array); badge rendering via `getStatusColor`; modal access control check; "Clear Filters" resets to hardcoded array; `handleViewDashboard` checks for COMMITTED or OCCURRED |
| Event settings page | `app/events/[id]/settings/page.tsx` | `<select>` with hardcoded `<option>` values; `isLocked = event?.status === 'OCCURRED'` |
| Dashboard page | `app/events/[id]/dashboard/page.tsx` | Event-level lock check (`status === 'OCCURRED'`); meeting status filters (MeetingStatus, not EventStatus — separate concern) |
| Calendar component | `components/reports/EventCalendar.tsx` | Uses `getStatusColor()` for bar colors — no hardcoded status strings |
| Map component | `components/reports/EventMap.tsx` | Uses `getStatusColor()` for marker colors — no hardcoded status strings |
| Intelligence subscribe | `app/intelligence/subscribe/page.tsx` | Inline status badge with hardcoded ternary (`CONFIRMED` → green, `CANCELED` → red, else → grey) |

---

## Complete Change Surface for Adding AWARENESS

### Layer 1: Status colors and TypeScript type (change first)

**File:** `lib/status-colors.ts`

Changes required:
- Add `AWARENESS` entry to `EVENT_STATUS_COLORS` with blue (`#3b82f6`) color values
- Change `OCCURRED` entry from blue to grey/slate color values

This file is the source of truth. All components that call `getStatusColor()` or `getStatusColor().markerColor` will automatically inherit the new colors once this file is changed. No other changes needed in `EventCalendar.tsx` or `EventMap.tsx`.

### Layer 2: Editability gate (change second)

**File:** `lib/events.ts` → `isEventEditable()`

Current code has a hardcoded allowlist:
```typescript
if (['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'].includes(eventIdOrStatus)) {
    return eventIdOrStatus !== 'OCCURRED'
}
```

Changes required:
- Add `'AWARENESS'` to the allowlist array so the fast-path branch recognises it
- The return logic (`!== 'OCCURRED'`) already correctly handles any new non-OCCURRED status

### Layer 3: API routes (no functional change needed, but one audit)

**File:** `app/api/events/[id]/route.ts`

The PATCH handler has two status-specific checks:
1. OCCURRED lock check (lines 91–102) — works correctly for AWARENESS with no change
2. COMMITTED validation requiring startDate, endDate, address (lines 110–128) — not triggered by AWARENESS, no change needed
3. DELETE blocks OCCURRED (line 189) — correct behaviour, AWARENESS events are deletable, no change

The POST handler defaults to `'PIPELINE'` when no status is provided — acceptable, no change needed.

**All other API routes** (`meetings`, `rooms`, `attendees`, `import`, `reset`) gate on `isEventEditable()`. Once Layer 2 is updated, these automatically accept AWARENESS-status events as editable.

### Layer 4: UI — status dropdown in settings (change third)

**File:** `app/events/[id]/settings/page.tsx`

Current `<select>` element has four hardcoded `<option>` elements. AWARENESS must be added as an option. The `isLocked` check (`event?.status === 'OCCURRED'`) is correct and needs no change.

The read-only lock banner message references reverting to "Committed or Pipeline" — optionally extend to mention "Awareness" but not strictly required.

### Layer 5: UI — events list page filters and modal (change fourth)

**File:** `app/events/page.tsx`

Three hardcoded status arrays must be updated:
1. `useState<string[]>(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'])` — initial filter state
2. The status filter checkbox list `{['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'].map(...)}` — rendered checkboxes
3. The "Clear Filters" button reset array — must include AWARENESS

One conditional access check also requires updating:
```typescript
// Line 130: modal access gate
if (canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED') {
```
AWARENESS events should also have dashboard access (or the condition should use `canManage` as the primary gate, with status checks only for non-manager users). The required behaviour per PROJECT.md is that AWARENESS events are fully editable — they should be accessible via the dashboard. Add `|| event.status === 'AWARENESS'` to this condition, or align with project requirements.

The status badge `<span>` rendering already calls `getStatusColor(event.status).className` dynamically — no change needed.

Display order in the filter list should follow: `AWARENESS → PIPELINE → COMMITTED → CANCELED → OCCURRED`.

### Layer 6: Intelligence subscribe page (low-priority fix)

**File:** `app/intelligence/subscribe/page.tsx`

Inline ternary badge (lines 285–288):
```typescript
e.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
e.status === 'CANCELED' ? 'bg-red-100 text-red-700' :
  'bg-zinc-100 text-zinc-500'
```

This is a separate, ad-hoc badge not using `getStatusColor`. AWARENESS would fall into the grey "else" branch, which is acceptable but suboptimal. Replace with a call to `getStatusColor(e.status).className` to make it consistent and automatically correct for all statuses.

---

## Build Order

The dependency chain flows from the type definition outward to consumers. Each layer depends on the one above it being stable.

```
1. lib/status-colors.ts          — type source; blocks everything
2. lib/events.ts                 — isEventEditable allowlist; blocks API editability
3. app/api/events/[id]/route.ts  — audit only; no code change needed
4. app/events/[id]/settings/page.tsx  — dropdown <option>
5. app/events/page.tsx           — filter arrays + modal access gate
6. app/intelligence/subscribe/page.tsx — cleanup badge (optional last)
```

No database migration is needed because `Event.status` is a plain `String` field. Running `npx prisma migrate dev --name add_awareness_status` will generate a migration file, but it will contain no SQL DDL changes — it acts as a record marker only. The migration can be skipped entirely if the team accepts the no-op; however creating it is recommended for audit trail consistency on the `multi-event` branch.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Treating status as a Prisma enum

The schema stores `status` as `String`. Adding an enum to the schema would require a destructive migration that converts existing string values and constrains future additions. Do not introduce a `enum EventStatus` in `schema.prisma` — the current architecture intentionally avoids this.

### Anti-Pattern 2: Hardcoded status strings scattered without updating all sites

Every location that hardcodes a status array must be updated atomically. The failure mode is: filter UI excludes AWARENESS events (they exist but never appear), or lock check fails because `isEventEditable` does not recognise `AWARENESS` as a status string and falls through to the DB fetch path.

### Anti-Pattern 3: Reusing blue for both AWARENESS and OCCURRED

PROJECT.md explicitly states OCCURRED must move to grey/slate when AWARENESS takes blue. If only AWARENESS is added without repainting OCCURRED, two statuses share the same colour, breaking the visual convention. Both changes belong in the same commit to `lib/status-colors.ts`.

---

## Scalability Considerations

This change surface is fully contained within the application layer. No external services (OpenClaw, Clerk, Cloudflare R2) have any awareness of `EventStatus` values. The OpenClaw AI tool `getROITargets` and `updateROITargets` pass event data by ID/slug; they do not filter or branch on event status. No intelligence API routes require updating.

---

## Sources

- Direct code inspection: `lib/status-colors.ts`, `lib/events.ts`, `prisma/schema.prisma`, `app/api/events/route.ts`, `app/api/events/[id]/route.ts`, `app/events/page.tsx`, `app/events/[id]/settings/page.tsx`, `app/events/[id]/dashboard/page.tsx`, `components/reports/EventCalendar.tsx`, `components/reports/EventMap.tsx`, `app/intelligence/subscribe/page.tsx`
- Project context: `.planning/PROJECT.md`
- Confidence: HIGH (all findings from direct source inspection, no external research required)
