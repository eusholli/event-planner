# Event Planner — Add Awareness Status

## What This Is

Event Planner is a Next.js application for managing multi-event conferences. This milestone adds a new `AWARENESS` status to the event lifecycle, representing early-stage prospective events before they enter the pipeline.

## Core Value

Events in the awareness phase are tracked and visible without cluttering the active pipeline — users can identify prospective events and advance them when ready.

## Requirements

### Validated

- ✓ Event status workflow: PIPELINE (amber) → COMMITTED (green) → OCCURRED (blue, currently read-only) → CANCELED (red) — existing
- ✓ EventStatus type defined in `lib/status-colors.ts` as a const map — existing
- ✓ Event CRUD via `/api/events` and `/api/events/[id]` — existing
- ✓ Event status filters on events list — existing
- ✓ Status badges rendered using `EVENT_STATUS_COLORS` — existing

### Active

- [ ] Add `AWARENESS` as a new event status (blue, #3b82f6) before PIPELINE in display order
- [ ] Reassign OCCURRED to grey/slate to free blue for AWARENESS
- [ ] Update Prisma schema: event `status` field validation/enum to accept `AWARENESS`
- [ ] Add database migration for the new status value
- [ ] Update all event CRUD routes to handle `AWARENESS`
- [ ] Update all event status filters to include `AWARENESS`
- [ ] Display order: AWARENESS → PIPELINE → COMMITTED → CANCELED → OCCURRED
- [ ] AWARENESS events are fully editable (no read-only restrictions)
- [ ] All status transitions allowed (no forced flow)

### Out of Scope

- MeetingStatus enum changes — only Event status is affected
- UI redesign beyond badge color changes

## Context

The `EventStatus` type is currently derived from `lib/status-colors.ts` (not a Prisma enum). The schema stores `status` as a plain `String` field with a `@default("PIPELINE")`. This means no Prisma enum migration is needed — only a DB migration that adds the new value is required if a DB-level constraint exists. The `lib/status-colors.ts` map is the primary source of truth for valid statuses.

Note: OCCURRED is currently blue (#3b82f6) in the code despite CLAUDE.md describing it as grey. AWARENESS will take blue; OCCURRED will be moved to grey/slate.

## Constraints

- **Tech**: Next.js App Router, Prisma (string status field, not enum), Tailwind CSS v4
- **Branch**: Work on `multi-event` branch; separate DB from `main`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AWARENESS = blue (#3b82f6) | User specified; blue currently used by OCCURRED | — Pending |
| OCCURRED reassigned to grey/slate | Free blue for AWARENESS; matches CLAUDE.md description | — Pending |
| No Prisma enum needed | Status stored as String in schema, not enum type | — Pending |
| Any-to-any state transitions | User preference; consistent with current behavior | — Pending |

---
*Last updated: 2026-03-17 after initialization*
