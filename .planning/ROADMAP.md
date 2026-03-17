# Roadmap: Event Planner — Add AWARENESS Status

## Overview

This milestone adds `AWARENESS` as a new event status before PIPELINE in the event lifecycle. The work is a contained brownfield addition: first establish AWARENESS as a valid type with correct colors in the status foundation layer, then propagate it across all UI surfaces and generate the required migration. Two phases reflect the strict dependency order — the type must be correct before any UI change can be validated.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Status Foundation** - Add AWARENESS to the type source of truth and editability gate
- [ ] **Phase 2: UI Surface and Migration** - Propagate AWARENESS to all user-visible UI locations and run migration

## Phase Details

### Phase 1: Status Foundation
**Goal**: AWARENESS is a fully valid EventStatus type with correct colors, correct display order, and recognized as editable by all event-scoped API routes
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. `EVENT_STATUS_COLORS` in `lib/status-colors.ts` contains an AWARENESS entry with blue (#3b82f6) colors and OCCURRED uses grey/slate colors
  2. `STATUS_DISPLAY_ORDER` exported from `lib/status-colors.ts` lists statuses in the order: AWARENESS, PIPELINE, COMMITTED, CANCELED, OCCURRED
  3. An AWARENESS event passes the `isEventEditable` check in `lib/events.ts` — API routes allow mutations on it without returning 403
**Plans:** 1 plan

Plans:
- [ ] 01-01-PLAN.md — Add AWARENESS colors, reassign OCCURRED to slate, export STATUS_DISPLAY_ORDER, update isEventEditable allowlist

### Phase 2: UI Surface and Migration
**Goal**: Users can see, filter, set, and navigate AWARENESS events through every primary UI surface, and the migration history on multi-event branch is clean
**Depends on**: Phase 1
**Requirements**: PORT-01, PORT-02, PORT-03, PORT-04, SETT-01, DB-01
**Success Criteria** (what must be TRUE):
  1. AWARENESS events appear in the events portfolio list when the page loads (default filter includes AWARENESS)
  2. The filter checkbox panel on the events portfolio page includes an AWARENESS option, and clearing filters re-includes AWARENESS
  3. Non-manager authorized users can click "View Dashboard" on an AWARENESS event without receiving a blocking alert
  4. The status dropdown on an event settings page shows "Awareness" as the first option, and saving it correctly sets the event status to AWARENESS
  5. `npx prisma migrate status` reports no pending migrations on the multi-event branch
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Status Foundation | 0/1 | Not started | - |
| 2. UI Surface and Migration | 0/TBD | Not started | - |
