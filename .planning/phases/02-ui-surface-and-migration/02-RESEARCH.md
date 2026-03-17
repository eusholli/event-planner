# Phase 2: UI Surface and Migration - Research

**Researched:** 2026-03-17
**Domain:** Next.js React UI modifications + Prisma migration (no-DDL)
**Confidence:** HIGH

## Summary

Phase 2 is a surgical code-change phase with no architectural novelty. All decisions are fully locked in CONTEXT.md and confirmed by direct inspection of the source files. The three source files to modify are small, well-understood, and already loaded as part of research. `STATUS_DISPLAY_ORDER` is confirmed exported from `lib/status-colors.ts` (Phase 1 complete). The Prisma schema stores event status as a plain `String` field — not a PostgreSQL enum — so the migration produces a no-DDL file, which is required only for build continuity on the multi-event branch.

The five UI changes are purely additive: three array swaps (hardcoded literals replaced with `STATUS_DISPLAY_ORDER`), two boolean condition additions (`|| event.status === 'AWARENESS'`), and one `<option>` insertion. No new dependencies, no new components, no API changes.

The test infrastructure uses Jest + ts-jest with existing unit tests in `lib/__tests__/status-colors.test.ts`. The planner must add a unit test file for the new Phase 2 logic as Wave 0 infrastructure.

**Primary recommendation:** Execute all five UI changes and the migration as a single wave with a parallel unit test task covering the logic predicates.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Filter arrays — app/events/page.tsx
- Import `STATUS_DISPLAY_ORDER` from `lib/status-colors.ts` and use it in all 3 places that currently hardcode the status array:
  - Line 40: `useState<string[]>([...STATUS_DISPLAY_ORDER])` (initial selected statuses)
  - Line 190: `setSelectedStatuses([...STATUS_DISPLAY_ORDER])` (Clear Filters reset handler)
  - Line 257: `{STATUS_DISPLAY_ORDER.map(status => (` (checkbox render loop)
- This makes AWARENESS automatically included in correct display order, and any future statuses are picked up without code changes

#### Dashboard access gate — app/events/page.tsx
- PORT-04: add `AWARENESS` to both gate conditions where non-managers are checked:
  - Line 130 `handleViewDashboard`: `if (canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED' || event.status === 'AWARENESS')`
  - Line 561 modal button visibility: same condition
- Update the alert message text to accurately reflect the new set of allowed statuses (currently says "COMMITTED or OCCURRED")

#### Status dropdown — app/events/[id]/settings/page.tsx
- Add `<option value="AWARENESS">Awareness</option>` as the **first** option in the status `<select>` (requirement SETT-01)
- Claude's discretion: whether to also refactor the remaining options to use STATUS_DISPLAY_ORDER dynamically

#### Database migration
- Run `npx prisma migrate dev --name add-awareness-status` — no DDL change needed (status is a plain String field, not a Prisma enum); migration is required for build continuity on the multi-event branch

### Claude's Discretion
- Exact wording of the updated dashboard access alert message
- Whether to refactor settings dropdown options to use STATUS_DISPLAY_ORDER (only required: AWARENESS first)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-01 | Filter state initialization array in `app/events/page.tsx` includes `'AWARENESS'` | Confirmed: line 40 currently `['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']`; swap to `[...STATUS_DISPLAY_ORDER]` |
| PORT-02 | "Clear Filters" reset handler array in `app/events/page.tsx` includes `'AWARENESS'` | Confirmed: line 190 same hardcoded array in the onClick of Clear Filters button; same swap |
| PORT-03 | Filter checkbox rendering loop in `app/events/page.tsx` includes `'AWARENESS'` | Confirmed: line 257 `['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'].map(status =>` — swap the array literal |
| PORT-04 | "View Dashboard" modal access gate includes AWARENESS (allows non-manager users to view AWARENESS events) | Confirmed: line 130 `handleViewDashboard` and line 561 modal button condition both need `|| event.status === 'AWARENESS'` |
| SETT-01 | Status `<select>` dropdown in `app/events/[id]/settings/page.tsx` includes `<option value="AWARENESS">Awareness</option>` as the first option | Confirmed: line 418 is the first `<option>` (currently "Pipeline"); insert AWARENESS above it |
| DB-01 | Prisma migration created with `prisma migrate dev --name add-awareness-status` (no DDL change; required for build continuity on multi-event branch) | Confirmed: Event.status is a plain String in schema; no enum migration needed; 13 prior migrations exist on the branch |
</phase_requirements>

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16 (project) | Page routing and React server/client components | Established project framework |
| React | (Next.js bundled) | Component rendering, useState, useEffect | Project foundation |
| Tailwind CSS v4 | 4 (project) | Utility-class styling | Established project design system |
| Prisma | (project) | Database ORM + migration runner | Established project DB layer |
| Jest + ts-jest | 30 / 29 (package.json) | Unit test framework | Already configured in jest.config.ts |

### Supporting (Phase 1 output — already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/status-colors.ts` | Phase 1 | `STATUS_DISPLAY_ORDER`, `getStatusColor` | All status array and badge uses |
| `lib/role-utils.ts` | (project) | `canManageEvents()` | Dashboard access gate check |

**Installation:** No new packages required for this phase.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes. Files modified in place:

```
app/
├── events/
│   ├── page.tsx              # 5 edits: 3 array swaps + 2 gate condition additions
│   └── [id]/settings/
│       └── page.tsx          # 1 edit: AWARENESS option inserted first in <select>
lib/
└── status-colors.ts          # READ ONLY — Phase 1 output, no changes
lib/__tests__/
└── events-page-logic.test.ts # NEW — Wave 0 unit test for gate predicates
```

### Pattern 1: STATUS_DISPLAY_ORDER Array Replacement

**What:** Replace every hardcoded `['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']` literal with `[...STATUS_DISPLAY_ORDER]` (spread to create a mutable copy for useState).

**When to use:** Anywhere a list of all statuses is needed.

**Example:**
```typescript
// Before (line 40, app/events/page.tsx)
const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'])

// After
import { STATUS_DISPLAY_ORDER } from '@/lib/status-colors'
const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...STATUS_DISPLAY_ORDER])
```

The spread `[...]` is required because `STATUS_DISPLAY_ORDER` is `as const` — mutable copy needed for `useState`.

### Pattern 2: Dashboard Gate Condition Extension

**What:** Extend boolean guard conditions to include `'AWARENESS'`.

**When to use:** Anywhere a condition gates access to already-gated statuses COMMITTED and OCCURRED.

**Example:**
```typescript
// Before (line 130, app/events/page.tsx)
if (canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED') {

// After
if (canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED' || event.status === 'AWARENESS') {
```

Same change required at line 561 (modal button render condition):
```typescript
// Before (line 561)
{(canManage || selectedEvent.status === 'COMMITTED' || selectedEvent.status === 'OCCURRED') && (

// After
{(canManage || selectedEvent.status === 'COMMITTED' || selectedEvent.status === 'OCCURRED' || selectedEvent.status === 'AWARENESS') && (
```

### Pattern 3: Settings Dropdown First-Option Insertion

**What:** Insert `<option value="AWARENESS">Awareness</option>` as the first child of the status `<select>`.

**Example:**
```tsx
// Before (lines 418-422, app/events/[id]/settings/page.tsx)
<option value="PIPELINE">Pipeline</option>
<option value="COMMITTED">Committed</option>
<option value="OCCURRED">Occurred</option>
<option value="CANCELED">Canceled</option>

// After
<option value="AWARENESS">Awareness</option>
<option value="PIPELINE">Pipeline</option>
<option value="COMMITTED">Committed</option>
<option value="OCCURRED">Occurred</option>
<option value="CANCELED">Canceled</option>
```

### Pattern 4: No-DDL Prisma Migration

**What:** Run `npx prisma migrate dev --name add-awareness-status` to produce a migration file with no SQL statements. This is idiomatic for build continuity when a schema change is semantic-only (string status values, not enum).

**When to use:** When a feature adds valid string values to a String field (not a Prisma enum).

### Anti-Patterns to Avoid

- **Partial array update:** Updating only some of the 3 hardcoded status arrays leaves the filter panel in an inconsistent state. All 3 must be updated in the same task.
- **Gate condition mismatch:** `handleViewDashboard` (line 130) and the modal button visibility condition (line 561) are separate locations that must be kept identical. Missing one means the button appears but clicking it triggers the blocking alert.
- **Spreading `as const` without spread operator:** `STATUS_DISPLAY_ORDER` is typed as a readonly tuple. Passing it directly as initial state value is fine for a read-only array, but `useState` requires a mutable array. Use `[...STATUS_DISPLAY_ORDER]` for the state initializer.
- **Running migrate in deploy mode:** Use `npx prisma migrate dev` (not `migrate deploy`) to generate the migration file. `migrate deploy` only applies existing files.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status ordering | Custom sort or manual ordering | `STATUS_DISPLAY_ORDER` from `lib/status-colors.ts` | Already defined in Phase 1; single source of truth |
| Status badge colors | Hardcoded className strings | `getStatusColor(event.status).className` | Already dynamic; picks up AWARENESS automatically |
| Role check | Custom role string comparison | `canManageEvents()` from `lib/role-utils` | Already used at line 36; no changes needed |

**Key insight:** Everything needed for this phase already exists in the codebase. The only work is wiring up the already-built Phase 1 exports.

---

## Common Pitfalls

### Pitfall 1: Forgetting the Second Gate Location
**What goes wrong:** The modal "View Dashboard" button is not shown for AWARENESS events even though the click handler was updated.
**Why it happens:** There are two independent conditional checks in `app/events/page.tsx` — the click handler at line 130 and the JSX render condition at line 561. Both check the same condition independently.
**How to avoid:** Treat lines 130 and 561 as a pair. Update both in the same edit. The test file must verify both paths.
**Warning signs:** The button is absent from the modal for AWARENESS events, OR clicking the button on an AWARENESS event shows an alert.

### Pitfall 2: Forgetting to Spread STATUS_DISPLAY_ORDER for useState
**What goes wrong:** TypeScript error: `readonly EventStatus[]` is not assignable to `string[]`.
**Why it happens:** `STATUS_DISPLAY_ORDER` is declared `as const` so TypeScript treats it as `readonly`. `useState<string[]>` requires a mutable array.
**How to avoid:** Always use `[...STATUS_DISPLAY_ORDER]` when passing to `useState` or `setSelectedStatuses`.
**Warning signs:** TypeScript compile error on the `useState` line.

### Pitfall 3: Migrating on the Wrong Branch
**What goes wrong:** Migration runs against the main branch database (V1 schema) instead of multi-event (V2 schema).
**Why it happens:** The project uses two separate `.env` files per branch. If the wrong one is active, the migration targets the wrong database.
**How to avoid:** Confirm `npm run db:multi` was run (or `.env` is pointing at the multi-event database) before running `npx prisma migrate dev`.
**Warning signs:** `npx prisma migrate status` shows a different migration history than the 13 existing migrations listed above.

### Pitfall 4: Alert Message Wording
**What goes wrong:** Alert text still says "COMMITTED or OCCURRED" after the code change.
**Why it happens:** The string literal at line 133 is separate from the boolean condition at line 130.
**How to avoid:** Update both the condition AND the alert string in the same edit.
**Warning signs:** Users see the old alert text when attempting to view a PIPELINE or CANCELED event dashboard.

---

## Code Examples

Verified patterns from direct file inspection:

### Confirmed Current State — app/events/page.tsx

Line 40 (initial state):
```typescript
const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'])
```

Line 190 (Clear Filters onClick):
```typescript
setSelectedStatuses(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'])
```

Line 257 (checkbox render loop):
```typescript
{['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'].map(status => (
```

Line 130 (click handler gate):
```typescript
if (canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED') {
    router.push(`/events/${event.slug || event.id}/dashboard`)
} else {
    alert('Event must be COMMITTED or OCCURRED to access management dashboard.')
}
```

Line 561 (modal button render condition):
```typescript
{(canManage || selectedEvent.status === 'COMMITTED' || selectedEvent.status === 'OCCURRED') && (
```

### Confirmed Current State — app/events/[id]/settings/page.tsx

Lines 418-422 (status select):
```tsx
<option value="PIPELINE">Pipeline</option>
<option value="COMMITTED">Committed</option>
<option value="OCCURRED">Occurred</option>
<option value="CANCELED">Canceled</option>
```

### Confirmed STATUS_DISPLAY_ORDER Export (lib/status-colors.ts, line 49)

```typescript
export const STATUS_DISPLAY_ORDER: EventStatus[] = ['AWARENESS', 'PIPELINE', 'COMMITTED', 'CANCELED', 'OCCURRED'];
```

### Alert Message (Claude's Discretion — recommended)

Per UI-SPEC.md Copywriting Contract:
```
"This event must be in Committed, Occurred, or Awareness status to access the management dashboard."
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']` literals | `[...STATUS_DISPLAY_ORDER]` from `lib/status-colors.ts` | Phase 2 (this phase) | Future statuses automatically included in filter and checkboxes |
| Gate: COMMITTED or OCCURRED only | Gate: COMMITTED, OCCURRED, or AWARENESS | Phase 2 (this phase) | Non-manager users can view AWARENESS event dashboards |

---

## Open Questions

1. **STATUS_DISPLAY_ORDER refactor for settings dropdown (Claude's Discretion)**
   - What we know: CONTEXT.md says "only required: AWARENESS first"; refactoring remaining options to use the array is optional
   - What's unclear: Whether the dynamic refactor adds maintenance value or creates unnecessary complexity for a 5-item static list
   - Recommendation: Do the refactor for consistency — the settings page already imports from `lib/status-colors.ts` is not confirmed, but the pattern is trivial to add. Flag for planner to decide based on task complexity budget.

2. **OpenClaw intel-report AWARENESS events (STATE.md blocker)**
   - What we know: The intel-report webhook filters `status: { not: 'CANCELED' }`, meaning AWARENESS events will appear in intelligence feeds
   - What's unclear: Whether this is the intended product behavior (tracked as a blocker in STATE.md)
   - Recommendation: Out of scope for this phase. Document in plan as a known concern but do not block execution.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29 |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npx jest lib/__tests__/ --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-01 | Filter state initialization includes AWARENESS | unit | `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage` | Wave 0 |
| PORT-02 | Clear Filters reset includes AWARENESS | unit | `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage` | Wave 0 |
| PORT-03 | Checkbox render loop includes AWARENESS | unit | `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage` | Wave 0 |
| PORT-04 | Dashboard gate allows AWARENESS (both locations) | unit | `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage` | Wave 0 |
| SETT-01 | Settings dropdown first option is AWARENESS | manual | Visual inspection / build check | manual-only |
| DB-01 | Prisma migration created with correct name | manual | `npx prisma migrate status` | manual-only |

**Notes on manual-only items:**
- SETT-01: The settings `<select>` renders correctly when the `<option>` is first in source order; verification is a browser visual check or a snapshot test. A snapshot test is not in scope given the team's current test infrastructure.
- DB-01: Migration creation is a CLI operation. Verification is `npx prisma migrate status` reporting no pending migrations.

### Sampling Rate

- **Per task commit:** `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage`
- **Per wave merge:** `npx jest lib/__tests__/ --no-coverage`
- **Phase gate:** `npx jest --no-coverage` full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/__tests__/events-page-logic.test.ts` — covers PORT-01 through PORT-04 (verifies `STATUS_DISPLAY_ORDER` is the right array to use and that `AWARENESS` passes the gate predicate)

The existing `lib/__tests__/status-colors.test.ts` covers Phase 1 foundation and already passes. No changes needed to it.

---

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `app/events/page.tsx` — confirmed all 5 edit locations with exact line numbers
- Direct file inspection: `app/events/[id]/settings/page.tsx` — confirmed status `<select>` at lines 418-422
- Direct file inspection: `lib/status-colors.ts` — confirmed `STATUS_DISPLAY_ORDER` export at line 49
- Direct file inspection: `.planning/phases/02-ui-surface-and-migration/02-CONTEXT.md` — locked decisions
- Direct file inspection: `.planning/REQUIREMENTS.md` — acceptance criteria for PORT-01 through DB-01
- Direct file inspection: `.planning/phases/02-ui-surface-and-migration/02-UI-SPEC.md` — copywriting contract, interaction contracts

### Secondary (MEDIUM confidence)
- `package.json` scripts + `jest.config.ts` — test infrastructure confirmed
- `prisma/migrations/` directory listing — 13 existing migrations confirmed; multi-event branch state

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct file inspection, no external dependencies
- Architecture: HIGH — all edit locations pinpointed with exact line numbers
- Pitfalls: HIGH — derived from direct code reading, not speculation

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable codebase; no fast-moving dependencies)
