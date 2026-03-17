# Event Planner

## What This Is

Event Planner is a Next.js application for managing multi-event conferences with attendees, meetings, and schedules. The system uses a status workflow to track events from early awareness through completion.

## Core Value

Events in the awareness phase are tracked and visible without cluttering the active pipeline — users can identify prospective events and advance them when ready.

## Requirements

### Validated

- ✓ Event status workflow: PIPELINE (amber) → COMMITTED (green) → OCCURRED (blue, read-only) → CANCELED (red) — v0 (existing)
- ✓ EventStatus type defined in `lib/status-colors.ts` as a const map — v0 (existing)
- ✓ Event CRUD via `/api/events` and `/api/events/[id]` — v0 (existing)
- ✓ Event status filters on events list — v0 (existing)
- ✓ Status badges rendered using `EVENT_STATUS_COLORS` — v0 (existing)
- ✓ AWARENESS as a new event status (blue, #3b82f6) before PIPELINE in display order — v1.0
- ✓ OCCURRED reassigned to grey/slate — v1.0
- ✓ `STATUS_DISPLAY_ORDER` exported for ordered UI consumption — v1.0
- ✓ AWARENESS events fully editable; `isEventEditable` derives allowlist dynamically — v1.0
- ✓ Events portfolio filter includes AWARENESS (default checked, clear-filters included) — v1.0
- ✓ Non-manager users can view dashboard for AWARENESS events — v1.0
- ✓ Settings dropdown shows Awareness as first option — v1.0
- ✓ Prisma migration in place for build continuity (no DDL needed; String field) — v1.0

### Active

- [ ] **INTEL-01**: `app/intelligence/subscribe/page.tsx` status badge uses hardcoded inline ternary — replace with `getStatusColor()` for AWARENESS blue support

### Out of Scope

- MeetingStatus enum changes — only Event status is affected
- UI redesign beyond badge color changes
- Forced state transitions — any-to-any transitions are intentional

## Context

Shipped v1.0 with AWARENESS status fully integrated across status layer and UI surfaces.
Tech stack: Next.js App Router, Prisma (string status field), Tailwind CSS v4, Clerk auth.
Status is stored as a plain `String` field in Prisma (not enum) — `lib/status-colors.ts` is the source of truth for valid statuses.
Jest + ts-jest unit test framework added in v1.0 (was absent before).

**Known tech debt from v1.0:**
- Dead `STATUS_DISPLAY_ORDER` import in `app/events/[id]/settings/page.tsx` (low severity)
- Duplicated dashboard gate conditions in `app/events/page.tsx` lines 130 + 561 (should extract to `canViewDashboard()` helper)

## Constraints

- **Tech**: Next.js App Router, Prisma (string status field, not enum), Tailwind CSS v4
- **Branch**: `multi-event` branch uses separate DB from `main`; never merge `multi-event` → `main`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AWARENESS = blue (#3b82f6) | User specified; blue was previously used by OCCURRED | ✓ Good — clear visual distinction |
| OCCURRED reassigned to grey/slate | Free blue for AWARENESS; matches CLAUDE.md description | ✓ Good — semantically correct (past event = muted) |
| No Prisma enum needed | Status stored as String in schema, not enum type | ✓ Good — no DDL migration required |
| Any-to-any state transitions | User preference; consistent with current behavior | ✓ Good — flexibility preserved |
| `Object.keys(EVENT_STATUS_COLORS)` for isEventEditable | Future-proof: new statuses auto-included | ✓ Good — eliminates maintenance burden |
| Jest + ts-jest for unit tests | TDD required; no unit framework existed | ✓ Good — 11 tests passing |

---
*Last updated: 2026-03-17 after v1.0 milestone*
