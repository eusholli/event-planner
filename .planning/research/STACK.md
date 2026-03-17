# Technology Stack: Add AWARENESS Event Status

**Project:** Event Planner — AWARENESS status milestone
**Researched:** 2026-03-17
**Confidence:** HIGH (brownfield codebase, all files directly inspected)

---

## Current Stack for Event Status Management

The status system is deliberately thin — no DB-level enum constraint, no dedicated status service. Every layer is impacted by adding a value, but no layer requires structural changes. The work is additive throughout.

### Source of Truth Layer

| Technology | File | Role |
|------------|------|------|
| TypeScript const map | `lib/status-colors.ts` | Primary source of truth. `EventStatus` type is derived via `keyof typeof EVENT_STATUS_COLORS`. Adding a key here propagates the type automatically. |
| Prisma String field | `prisma/schema.prisma` line 34 | `status String @default("PIPELINE")`. No enum — any string is accepted at the DB level. No Prisma schema edit needed. |
| PostgreSQL | Database | Stores status as a plain VARCHAR. No check constraint exists in the Prisma-managed schema. No DB migration needed for the new value itself. |

### API Layer

| File | Status-Relevant Logic |
|------|-----------------------|
| `app/api/events/route.ts` | POST defaults to `'PIPELINE'`; passes through any provided `json.status` string without validation. AWARENESS will work immediately without code changes — but is undocumented there. |
| `app/api/events/[id]/route.ts` | PATCH: OCCURRED lock check (lines 92–102), COMMITTED gate check (lines 110–128), DELETE OCCURRED block (line 189). All use string literals. No allowlist — any string status passes. |

### UI Layer — Hardcoded Status Lists

Every one of these files hardcodes the four status values as an array or as `<option>` elements. Each requires a change to include AWARENESS.

| File | Location | Change Needed |
|------|----------|---------------|
| `app/events/page.tsx` | Line 40: `useState<string[]>(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'])` | Add `'AWARENESS'` |
| `app/events/page.tsx` | Line 190: reset handler re-initialises same array | Add `'AWARENESS'` |
| `app/events/page.tsx` | Line 257: `['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'].map(...)` filter checkbox list | Add `'AWARENESS'` |
| `app/events/[id]/settings/page.tsx` | Lines 418–421: four `<option>` elements in status `<select>` | Add `<option value="AWARENESS">Awareness</option>` |
| `app/events/[id]/dashboard/page.tsx` | Line 60: meeting-status filter array (MeetingStatus, not EventStatus — leave alone) | No change needed |
| `app/events/[id]/dashboard/page.tsx` | Line 638: reset handler for meeting status filter | No change needed (meeting statuses) |
| `app/events/[id]/dashboard/page.tsx` | Line 720: meeting status filter `.map(...)` | No change needed (meeting statuses) |

### UI Layer — Lock/Read-only Logic

The OCCURRED lock is the only conditional that restricts editing based on event status. AWARENESS must NOT trigger it. Current logic already only locks on `=== 'OCCURRED'`, so AWARENESS is safe without changes to this logic.

| File | Line | Logic | AWARENESS Impact |
|------|------|-------|-----------------|
| `app/events/[id]/settings/page.tsx` | 279 | `isLocked = event?.status === 'OCCURRED'` | Safe — AWARENESS is not OCCURRED |
| `app/events/[id]/calendar/page.tsx` | 146 | `if (eventData.status === 'OCCURRED')` | Safe |
| `app/events/[id]/attendees/page.tsx` | 140 | `if (eventData.status === 'OCCURRED')` | Safe |
| `app/events/[id]/dashboard/page.tsx` | 103 | `if (eventData.status === 'OCCURRED')` | Safe |
| `app/api/events/[id]/route.ts` | 92, 189 | OCCURRED string comparisons | Safe |
| `lib/events.ts` | 26 | `event.status !== 'OCCURRED'` | Safe — AWARENESS is editable |

### Dashboard Gating Logic

`app/events/page.tsx` lines 130 and 561 gate dashboard access: non-managers can only reach the dashboard if status is `COMMITTED` or `OCCURRED`. AWARENESS events would be inaccessible to non-manager roles under this logic. **This is a deliberate design decision** — verify with the user whether AWARENESS events should allow dashboard access for non-managers. The requirement states AWARENESS events are fully editable; clarify if that extends to dashboard access.

### Color Assignment

| Status | Current Colors | Change Required |
|--------|---------------|-----------------|
| AWARENESS | (does not exist) | Add: `bg: '#3b82f6'` (blue), `text: '#1d4ed8'`, `border: '#dbeafe'`, Tailwind: `bg-blue-50 text-blue-700 border border-blue-100` |
| OCCURRED | `bg: '#3b82f6'` (blue) — SAME as above | Reassign to grey/slate: `bg: '#64748b'`, `text: '#334155'`, `border: '#e2e8f0'`, Tailwind: `bg-slate-50 text-slate-700 border border-slate-100` |
| PIPELINE | `#f59e0b` amber | No change |
| COMMITTED | `#10b981` green | No change |
| CANCELED | `#ef4444` red | No change |

Note: `app/intelligence/subscribe/page.tsx` (lines 285–287, 364–366) uses inline Tailwind classes instead of `EVENT_STATUS_COLORS`. These only handle `CONFIRMED` (which is a MeetingStatus, not EventStatus) and `CANCELED`, with a grey fallback for everything else. AWARENESS will render as grey there — acceptable, but verify intent.

---

## Database Migration Assessment

**No Prisma schema migration is needed.**

The `Event.status` field is `String` with no `@db.VarChar` length constraint, no `@unique`, and no Prisma-level enum. PostgreSQL stores it as text. The new string `'AWARENESS'` is accepted immediately.

A migration file would only be needed if:
- A DB check constraint existed (it does not — Prisma-managed schema has none), or
- Existing rows needed backfilling to `AWARENESS` (they do not — no existing events should default to AWARENESS).

Run `npx prisma migrate dev --name add-awareness-status` only as a no-op migration if the team wants the migration log to record the intent. The generated SQL will be empty. This is optional but recommended for audit trail.

---

## Complete Change Inventory

### Must Change (functional correctness)

| File | What | Why |
|------|------|-----|
| `lib/status-colors.ts` | Add `AWARENESS` key with blue colors; change `OCCURRED` to slate | Color rendering + TypeScript type extension |
| `app/events/page.tsx` (×3) | Add `'AWARENESS'` to status arrays (lines 40, 190, 257) | Filter UI — AWARENESS events would be invisible without this |
| `app/events/[id]/settings/page.tsx` | Add `<option value="AWARENESS">Awareness</option>` before Pipeline | Cannot set/see AWARENESS in settings form without this |

### Should Change (completeness/consistency)

| File | What | Why |
|------|------|-----|
| `scripts/generate-test-db.ts` | Add an AWARENESS test event | Test DB reflects full status set |
| `tests/api/events.spec.ts` | Add tests for AWARENESS creation and transition | Coverage |

### Need Not Change (safe as-is)

| File | Reason |
|------|--------|
| `prisma/schema.prisma` | String field; no enum change needed |
| `app/api/events/route.ts` | No allowlist; AWARENESS passes through |
| `app/api/events/[id]/route.ts` | All checks are string equality against `'OCCURRED'`/`'COMMITTED'`; AWARENESS is unaffected |
| `lib/events.ts` | `isEditable` checks `!== 'OCCURRED'`; AWARENESS is editable |
| All OCCURRED lock checks in pages | Only check for `'OCCURRED'`; AWARENESS is never locked |
| `app/intelligence/subscribe/page.tsx` | Falls through to grey default; acceptable degradation |
| Meeting-related status code | MeetingStatus is a separate Prisma enum; entirely unrelated |

---

## Display Order Implementation

The PROJECT.md requirement is: `AWARENESS → PIPELINE → COMMITTED → CANCELED → OCCURRED`.

`lib/status-colors.ts` is a plain object — JS object key order is preserved in V8 for string keys. Re-ordering the keys controls display order anywhere the object is iterated. Ensure `AWARENESS` is the first key.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| DB status enforcement | No change (String field) | Add Prisma enum | Would require ALTER TYPE migration, all existing migrations become sensitive; far more work for no benefit given the TypeScript type already constrains valid values |
| Color reassignment | Move OCCURRED to slate | Leave OCCURRED blue, pick a different blue shade for AWARENESS | User requirement explicitly states AWARENESS = blue (#3b82f6); two near-identical blues would be confusing |
| Filter state initialization | Hard-code AWARENESS in arrays | Derive from `EVENT_STATUS_COLORS` keys | Deriving is more maintainable — if arrays were generated with `Object.keys(EVENT_STATUS_COLORS)`, future status additions would be zero-touch in filter UI. This refactor is out of scope for this milestone but worth noting. |

---

## Sources

- `lib/status-colors.ts` — direct inspection (HIGH confidence)
- `prisma/schema.prisma` — direct inspection (HIGH confidence)
- `app/api/events/route.ts` — direct inspection (HIGH confidence)
- `app/api/events/[id]/route.ts` — direct inspection (HIGH confidence)
- `app/events/page.tsx` — direct inspection (HIGH confidence)
- `app/events/[id]/settings/page.tsx` — direct inspection (HIGH confidence)
- `app/events/[id]/dashboard/page.tsx` — direct inspection (HIGH confidence)
- `.planning/PROJECT.md` — project requirements (HIGH confidence)
- `CLAUDE.md` — architecture documentation (HIGH confidence)
