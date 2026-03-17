# Phase 2: UI Surface and Migration - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Propagate AWARENESS to every user-visible surface in the app: filter checkbox panel, filter state initialization, "Clear Filters" reset, dashboard access gate, and the event settings status dropdown. Also run a no-op Prisma migration for build continuity on the multi-event branch. No new capabilities — only surfacing the status that Phase 1 established.

</domain>

<decisions>
## Implementation Decisions

### Filter arrays — app/events/page.tsx
- Import `STATUS_DISPLAY_ORDER` from `lib/status-colors.ts` and use it in all 3 places that currently hardcode the status array:
  - Line 40: `useState<string[]>([...STATUS_DISPLAY_ORDER])` (initial selected statuses)
  - Line 190: `setSelectedStatuses([...STATUS_DISPLAY_ORDER])` (Clear Filters reset handler)
  - Line 257: `{STATUS_DISPLAY_ORDER.map(status => (` (checkbox render loop)
- This makes AWARENESS automatically included in correct display order, and any future statuses are picked up without code changes

### Dashboard access gate — app/events/page.tsx
- PORT-04: add `AWARENESS` to both gate conditions where non-managers are checked:
  - Line 130 `handleViewDashboard`: `if (canManage || event.status === 'COMMITTED' || event.status === 'OCCURRED' || event.status === 'AWARENESS')`
  - Line 561 modal button visibility: same condition
- Update the alert message text to accurately reflect the new set of allowed statuses (currently says "COMMITTED or OCCURRED")

### Status dropdown — app/events/[id]/settings/page.tsx
- Add `<option value="AWARENESS">Awareness</option>` as the **first** option in the status `<select>` (requirement SETT-01)
- Claude's discretion: whether to also refactor the remaining options to use STATUS_DISPLAY_ORDER dynamically

### Database migration
- Run `npx prisma migrate dev --name add-awareness-status` — no DDL change needed (status is a plain String field, not a Prisma enum); migration is required for build continuity on the multi-event branch

### Claude's Discretion
- Exact wording of the updated dashboard access alert message
- Whether to refactor settings dropdown options to use STATUS_DISPLAY_ORDER (only required: AWARENESS first)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — PORT-01 through PORT-04, SETT-01, DB-01 define exact acceptance criteria for every change in this phase

### Source files to modify
- `app/events/page.tsx` — Events portfolio page; contains all 3 hardcoded filter arrays and the dashboard access gate (2 locations)
- `app/events/[id]/settings/page.tsx` — Event settings page; contains the status `<select>` dropdown

### Phase 1 output (foundation this phase builds on)
- `lib/status-colors.ts` — `STATUS_DISPLAY_ORDER` export added in Phase 1; import this for filter arrays
- `.planning/phases/01-status-foundation/01-CONTEXT.md` — Phase 1 decisions (AWARENESS=blue, OCCURRED=slate, display order)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `STATUS_DISPLAY_ORDER` from `lib/status-colors.ts` — already exported by Phase 1; use it to replace all hardcoded status arrays
- `getStatusColor()` from `lib/status-colors.ts` — already used in the events page for badge rendering; no changes needed
- `canManageEvents()` from `lib/role-utils` — already used in the dashboard gate check; no changes needed

### Established Patterns
- Filter checkboxes rendered via `.map(status => ...)` loop — swap the hardcoded array literal to `STATUS_DISPLAY_ORDER`
- Status badges use `getStatusColor(event.status).className` — already dynamic, picks up AWARENESS automatically
- Status `<select>` uses static `<option>` elements — add AWARENESS manually as first option

### Integration Points
- 3 locations in `app/events/page.tsx` share the same status list — all must be updated consistently
- Dashboard gate has 2 separate locations in the same file (click handler + modal button render condition) — both need AWARENESS
- `app/events/[id]/settings/page.tsx` status dropdown is independent of the filter arrays

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-ui-surface-and-migration*
*Context gathered: 2026-03-17*
