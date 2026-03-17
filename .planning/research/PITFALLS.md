# Pitfalls Research

**Domain:** Adding a new event status (AWARENESS) to an existing Next.js/Prisma event management system
**Researched:** 2026-03-17
**Confidence:** HIGH — all findings based on direct codebase analysis, not web search

---

## Critical Pitfalls

### Pitfall 1: Stale Hardcoded Status Arrays in the Events List Page

**What goes wrong:**
`app/events/page.tsx` contains three separate hardcoded arrays of status values that are not derived from `EVENT_STATUS_COLORS`. Adding `AWARENESS` to `lib/status-colors.ts` does not automatically update these locations. AWARENESS events will be invisible by default (filtered out on load), and "Clear Filters" resets to the old list, hiding any AWARENESS events the user was trying to view.

Specific lines at risk:
- Line 40: `useState<string[]>(['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'])` — initial filter selection excludes AWARENESS
- Line 191: Same array literal inside the "Clear Filters" handler — clearing filters hides AWARENESS events
- Line 257: The status filter checkbox loop iterates a literal array — AWARENESS gets no checkbox

**Why it happens:**
The status filter list was written as a literal array rather than derived from the `EVENT_STATUS_COLORS` keys. It's easy to add to `lib/status-colors.ts` and assume the UI updates automatically, but these three spots are fully independent.

**How to avoid:**
Replace all three literal arrays with `Object.keys(EVENT_STATUS_COLORS)` ordered by desired display order. Define a `STATUS_DISPLAY_ORDER` constant in `lib/status-colors.ts` that lists statuses in the desired order (AWARENESS, PIPELINE, COMMITTED, CANCELED, OCCURRED) and use that everywhere.

**Warning signs:**
- Create an AWARENESS event in dev, reload the Events Portfolio — it does not appear in the list despite existing in the database.
- Checking the Network tab shows the API returning the event correctly.
- The checkbox filter has no AWARENESS option.

**Layer at risk:** Frontend (`app/events/page.tsx`)

---

### Pitfall 2: The `isEventEditable` Whitelist in `lib/events.ts`

**What goes wrong:**
`lib/events.ts` line 13 contains an explicit string array: `['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED']`. When called with the string `'AWARENESS'`, this condition is `false` — so the function falls through to the DB-query path, which is correct. However, if a developer ever adds AWARENESS to the whitelist check without preserving the `!== 'OCCURRED'` logic, they could accidentally make AWARENESS events read-only or accidentally make OCCURRED editable. More critically, this code is the sole gatekeeper for child-resource mutations (meetings, rooms, attendees) across all event-scoped API routes. Any regression here silently locks or unlocks events.

**Why it happens:**
The function was written for four statuses and uses an array for the fast-path. New statuses do not break it but create a misleading inconsistency: the whitelist doesn't include AWARENESS but the function still works correctly for it through the DB path. This looks like a bug to the next developer.

**How to avoid:**
Refactor `isEventEditable` to test `eventIdOrStatus !== 'OCCURRED'` only (positive check on the locking status), removing the whitelist entirely. The whitelist currently adds no value and creates confusion.

**Warning signs:**
- TypeScript does not catch this — the parameter type is `string`.
- Tests for child-resource creation on AWARENESS events unexpectedly return 403.

**Layer at risk:** Server utility (`lib/events.ts`), all event-scoped API routes that import it.

---

### Pitfall 3: OCCURRED Color Reassignment Creates Silent Visual Regression

**What goes wrong:**
OCCURRED is currently blue (`#3b82f6`) in `lib/status-colors.ts`. AWARENESS will also be blue. Changing OCCURRED to grey without auditing every consumer creates a risk: any component that hardcodes blue as the visual signal for "past event" (e.g. the stats panel in `app/events/[id]/dashboard/page.tsx` which uses `text-blue-700` for PIPELINE stats and `text-green-700` for OCCURRED stats at lines 685 and 693) may visually break or become misleading even though the data is correct.

The intelligence subscribe page (`app/intelligence/subscribe/page.tsx`) uses its own inline status-color ternary at lines 285–288 and 364–367 that is completely disconnected from `EVENT_STATUS_COLORS`. It hardcodes green for `CONFIRMED` (not `COMMITTED`) and red for `CANCELED`, and falls back to a default for everything else. AWARENESS events would render with the fallback style — potentially looking identical to PIPELINE events in that UI.

**Why it happens:**
`getStatusColor()` is not used consistently. Some components import it properly; others inline their own color logic. When the source of truth changes, only the components using `getStatusColor()` update automatically.

**How to avoid:**
Before changing OCCURRED's color, run a codebase-wide search for hardcoded color values (`#3b82f6`, `blue-700`, `bg-blue`) and cross-reference against status rendering. The intelligence subscribe page ternary must be updated to use `getStatusColor()` or at minimum handle AWARENESS explicitly. Also audit `app/events/[id]/dashboard/page.tsx`'s stats counters to confirm they are keyed dynamically.

**Warning signs:**
- The Events Portfolio card for an OCCURRED event no longer shows a blue side-bar after the color change, but the intelligence subscribe page still shows it as blue.
- AWARENESS events appear with no distinct styling in the subscribe UI.

**Layer at risk:** Frontend, multiple components. `lib/status-colors.ts`, `app/events/page.tsx`, `app/intelligence/subscribe/page.tsx`, `app/events/[id]/dashboard/page.tsx`.

---

### Pitfall 4: Settings Page Status Dropdown is a Hardcoded `<select>` with No AWARENESS Option

**What goes wrong:**
`app/events/[id]/settings/page.tsx` lines 417–422 render the status selector as four hardcoded `<option>` elements. Adding AWARENESS to the backend and `lib/status-colors.ts` does not add it to this dropdown. Users will be unable to manually set an event to AWARENESS from the UI — they can only do so programmatically or by creating a new event with a pre-set status. More subtly, if an event IS in AWARENESS status and a user opens the settings page, the `<select>` will have no matching `<option>` for the current value, causing browsers to either show a blank or silently snap to the first option on save.

**Why it happens:**
Hardcoded `<option>` lists are the path of least resistance in forms. There is no shared `StatusSelect` component — each page that needs status selection writes its own.

**How to avoid:**
Derive the `<option>` list from `Object.keys(EVENT_STATUS_COLORS)` sorted by `STATUS_DISPLAY_ORDER`. This is a one-time refactor that prevents all future status additions from requiring a form update.

**Warning signs:**
- Open an AWARENESS event in settings. The status field is blank or shows "Pipeline".
- Saving settings without changing the status field quietly overwrites the event's status to "PIPELINE" because the browser defaults to the first `<option>`.

**Layer at risk:** Frontend (`app/events/[id]/settings/page.tsx`).

---

### Pitfall 5: `handleViewDashboard` Permission Check Excludes AWARENESS

**What goes wrong:**
`app/events/page.tsx` line 130 and line 561 gate dashboard access with:
```
canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED'
```
Non-manager users cannot access the dashboard of AWARENESS events. This is probably wrong — AWARENESS events are fully editable by design, so authorized users should be able to reach the dashboard. The user-facing error message ("Event must be COMMITTED or OCCURRED to access management dashboard") is also semantically incorrect for the new lifecycle.

**Why it happens:**
The gate was written when COMMITTED and OCCURRED were the only statuses that had committed dates/data worth managing. AWARENESS is a new pre-pipeline state that was not anticipated.

**How to avoid:**
Update the condition to include AWARENESS: `canManage || ['AWARENESS', 'COMMITTED', 'OCCURRED'].includes(event.status)`. Or, reconsider the gate entirely — since PIPELINE events are already managed via the dashboard, the condition may need a broader rethink.

**Warning signs:**
- Log in as a non-manager user who is authorized for an AWARENESS event.
- Click the event card. The "View Dashboard" button does not appear (or clicking it shows an alert instead of navigating).

**Layer at risk:** Frontend (`app/events/page.tsx`).

---

### Pitfall 6: Missing DB Migration Causes Runtime Failures on the Multi-Event Branch

**What goes wrong:**
The schema stores `status` as a plain `String` field with `@default("PIPELINE")` — no enum constraint. This means PostgreSQL accepts any string, so AWARENESS values can be written without a migration. However, `npx prisma migrate dev` must still be run to update Prisma's migration history. If the migration is skipped, the build step `npm run build` (which calls `prisma migrate deploy`) will fail in production because the migration history is out of sync, even though no schema DDL changes are actually required.

More critically: the `multi-event` branch has its own migration sequence that must not receive migration files from `main`. The CLAUDE.md migration rule requires deleting any `main`-branch migration folders that land in `multi-event` after a merge and re-running `prisma migrate dev`. If a developer adds an AWARENESS migration on `main` and then merges to `multi-event` without following this process, the migration history breaks.

**Why it happens:**
"No Prisma enum needed" can be misread as "no migration needed." The migration is needed for history continuity, not for schema DDL.

**How to avoid:**
Run `npx prisma migrate dev --name add-awareness-status` on the `multi-event` branch after any schema documentation update, even if the generated SQL migration file is empty or trivial. Document explicitly that the migration is for history, not for DDL.

**Warning signs:**
- `npm run build` fails with `P3009` (migrate found failed migration) or similar Prisma error.
- `npx prisma migrate status` shows drift between the local schema and migration history.

**Layer at risk:** Database migration layer, CI/CD, `multi-event` branch isolation.

---

### Pitfall 7: Tests and Verification Scripts Do Not Cover AWARENESS

**What goes wrong:**
`tests/api/events.spec.ts` creates events with `status: 'PIPELINE'` and patches to `'COMMITTED'`. The `scripts/verify-occurred-lock.ts` explicitly tests only the four existing statuses. Neither covers AWARENESS. After the change, there is no automated verification that:
- AWARENESS events are editable (not locked by the OCCURRED check)
- AWARENESS events appear in the filter default
- AWARENESS events can be created via POST with `status: 'AWARENESS'`
- The color is correct

**Why it happens:**
Tests were written for the statuses that existed at the time. New statuses require deliberate test additions — they are not automatically covered by existing test structure.

**How to avoid:**
Add a test case in `events.spec.ts` that creates an event with `status: 'AWARENESS'`, verifies it is returned by GET, verifies PATCH works (editability), and verifies it is not blocked by the OCCURRED lock check. Update `verify-occurred-lock.ts` to also confirm AWARENESS events pass the editability check.

**Warning signs:**
- All existing tests pass but AWARENESS events fail in manual QA.
- No test is explicitly named for AWARENESS in the test suite.

**Layer at risk:** Test layer, `tests/api/events.spec.ts`, `scripts/verify-occurred-lock.ts`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode status arrays inline per component | Fast to write | Every new status requires hunting N locations | Never — define a central `STATUS_DISPLAY_ORDER` constant |
| Skip `STATUS_DISPLAY_ORDER` constant, rely on `Object.keys()` | Simpler code | Display order is unpredictable across JS engines | Never for UI-facing order |
| Reuse the existing `getStatusColor` fallback (returns PIPELINE color for unknown status) | No code change needed | AWARENESS events silently render as amber/pipeline-colored | Never — add AWARENESS to the map explicitly |
| Test only PIPELINE and COMMITTED in spec | Faster test writing | AWARENESS-specific bugs go undetected until production | Never — add at least one AWARENESS test case |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenClaw Intelligence (`/api/webhooks/intel-report/route.ts`) | Assumes CANCELED is the only non-active status in upcoming event filtering (`status: { not: 'CANCELED' }`) | AWARENESS events will appear in the 30-day upcoming feed even if they should not — audit the filter intent |
| Prisma String status field | Assuming no migration needed because no DDL change is required | Run `prisma migrate dev` for history continuity; follow multi-event branch merge rules |
| `isEventEditable` in child-resource API routes | Treating AWARENESS as a special case in the whitelist check | No change needed — the function already handles unknown statuses via DB query correctly |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| AWARENESS absent from status filter default | Users who expect to see all events on first load miss AWARENESS events — they exist in the DB but are invisible | Always derive the default filter array from the canonical status list |
| Status dropdown shows blank when editing AWARENESS event | Saving without touching status silently changes the event to PIPELINE | Derive `<option>` list from `EVENT_STATUS_COLORS`; validate that current status is always represented |
| "View Dashboard" blocked for AWARENESS | Authorized non-manager users cannot access the event they are supposed to manage | Include AWARENESS in the dashboard access condition |
| OCCURRED color change breaks visual mental model | Users who associate blue with "past event" now see grey — cognitive retraining needed | Communicate the color change in release notes; consider a brief in-app tooltip |

---

## "Looks Done But Isn't" Checklist

- [ ] **`lib/status-colors.ts`:** AWARENESS added AND OCCURRED color changed to grey — verify both, not just one.
- [ ] **Filter defaults:** All three literal arrays in `app/events/page.tsx` updated — initial state, clear-filters handler, and the checkbox loop.
- [ ] **Settings dropdown:** `<select>` in settings page includes AWARENESS `<option>` and current status always matches a valid option.
- [ ] **Dashboard access gate:** Non-manager authorized users can reach the dashboard for an AWARENESS event.
- [ ] **`isEventEditable` behavior:** Manually verified that AWARENESS events allow child-resource creation (meetings, rooms, attendees) without a 403.
- [ ] **Intelligence subscribe page:** Status ternary updated to handle AWARENESS with correct color, not falling back to a default that looks identical to another status.
- [ ] **Migration created:** `npx prisma migrate status` shows no drift on `multi-event` branch.
- [ ] **Tests exist:** At least one test creates an AWARENESS event and verifies editability.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| AWARENESS events invisible in filter | LOW | Add to three literal arrays in `app/events/page.tsx`; deploy; no data migration needed |
| Status dropdown saves wrong status | MEDIUM | Fix dropdown; run DB query to find events incorrectly saved as PIPELINE; manually reset status |
| Dashboard inaccessible for AWARENESS | LOW | Update condition; redeploy; no data change needed |
| Migration history broken on multi-event branch | MEDIUM | Follow CLAUDE.md merge rule: delete conflicting migration folders, re-run `prisma migrate dev` |
| OCCURRED color change missed in non-`getStatusColor` components | LOW | Grep for hardcoded blue values; update inline ternaries; redeploy |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stale filter arrays in events page | Phase: Status definition + filter update | Load events page; create AWARENESS event; verify it appears by default |
| `isEventEditable` whitelist confusion | Phase: Editable-check audit | Attempt to create a meeting on an AWARENESS event; expect 201 not 403 |
| OCCURRED color reassignment regression | Phase: `lib/status-colors.ts` + consumer audit | Visual review of events page, dashboard, and subscribe page with both AWARENESS and OCCURRED events present |
| Settings dropdown missing AWARENESS | Phase: Settings form update | Open settings for an AWARENESS event; verify dropdown shows correct current value |
| Dashboard access gate excludes AWARENESS | Phase: Permission condition update | Log in as non-manager with AWARENESS event authorized; verify dashboard loads |
| DB migration history drift | Phase: Migration creation | Run `npx prisma migrate status`; expect clean state |
| Tests do not cover AWARENESS | Phase: Test update | Run test suite; confirm at least one AWARENESS-specific case passes |

---

## Sources

- Direct codebase analysis: `lib/status-colors.ts`, `lib/events.ts`, `app/events/page.tsx`, `app/events/[id]/settings/page.tsx`, `app/events/[id]/attendees/page.tsx`, `app/events/[id]/dashboard/page.tsx`, `app/intelligence/subscribe/page.tsx`
- Direct codebase analysis: `app/api/events/route.ts`, `app/api/events/[id]/route.ts`, `app/api/meetings/route.ts`, `app/api/meetings/[id]/route.ts`
- Direct codebase analysis: `scripts/verify-occurred-lock.ts`, `tests/api/events.spec.ts`
- `prisma/schema.prisma` — confirms `status` is `String` not enum
- `.planning/PROJECT.md` — milestone requirements and key decisions
- `CLAUDE.md` — multi-event branch merge rules and migration workflow

---
*Pitfalls research for: Adding AWARENESS event status to Next.js/Prisma event management system*
*Researched: 2026-03-17*
