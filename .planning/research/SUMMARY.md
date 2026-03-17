# Project Research Summary

**Project:** Event Planner — Add AWARENESS Event Status
**Domain:** Brownfield feature addition — event lifecycle management
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

This milestone adds a new `AWARENESS` status to the event lifecycle, sitting before `PIPELINE` in the ordering (`AWARENESS → PIPELINE → COMMITTED → CANCELED → OCCURRED`). The change is entirely additive at the database level — `Event.status` is a plain `String` field in Prisma with no enum constraint, so no DDL migration is required. The real source of truth is the `lib/status-colors.ts` map, and `EventStatus` is derived as `keyof typeof EVENT_STATUS_COLORS`. Adding `AWARENESS` there propagates the TypeScript type automatically, and all components that use `getStatusColor()` inherit the new color without further changes.

The recommended approach is a layered, dependency-ordered implementation: start at `lib/status-colors.ts` (type source and color definitions, including reassigning `OCCURRED` from blue to grey/slate), then update `lib/events.ts` (`isEventEditable` allowlist), then the settings page dropdown, then the events portfolio page filter arrays and dashboard access gate, and finally the intelligence subscribe page badge as a low-priority cleanup. The entire change surface is contained within the application layer — no external services (OpenClaw, Clerk, Cloudflare R2, database schema) require structural modification.

The key risk is partial implementation: several UI locations hardcode the status list as literal arrays independent of `EVENT_STATUS_COLORS`. Adding AWARENESS to the source-of-truth file does not automatically update these locations. AWARENESS events will be invisible in the portfolio filter, inaccessible to non-manager users via the dashboard, and unselectable in the settings form unless each hardcoded site is also updated. The pitfalls research documents seven specific failure modes; the four most critical are the stale filter arrays, the settings dropdown missing the new option, the dashboard access gate exclusion, and the `isEventEditable` allowlist ambiguity. All four are low-effort fixes once identified.

## Key Findings

### Recommended Stack

No new technologies are introduced by this milestone. The existing stack — Next.js App Router, Prisma (String status field), TypeScript, Tailwind CSS, Clerk — handles the addition without modification. The architecture intentionally avoids Prisma enums for event status, which is the correct choice: adding an enum would require a destructive ALTER TYPE migration and is unnecessary given the TypeScript type constraint already enforces valid values at compile time.

**Core technologies (status-relevant):**
- `lib/status-colors.ts`: Primary source of truth — `EventStatus` type is derived from this map; all badge and color rendering flows through `getStatusColor()`.
- Prisma String field (`Event.status`): No enum constraint; AWARENESS is accepted by the DB immediately; a no-op migration is recommended for audit trail only.
- TypeScript const map: Adding a key to `EVENT_STATUS_COLORS` extends the `EventStatus` union type automatically — zero-touch propagation to type-safe callers.

### Expected Features

All changes in this milestone are P1 (must-have) with the exception of one P2 cosmetic cleanup.

**Must have (table stakes):**
- `lib/status-colors.ts` AWARENESS entry (blue `#3b82f6`) + OCCURRED recolor (grey/slate) — unblocks all downstream rendering.
- `app/events/page.tsx` filter arrays (3 locations: initial state, Clear Filters reset, checkbox loop) — without this, AWARENESS events are invisible by default.
- `app/events/page.tsx` dashboard access gate (`handleViewDashboard` + modal button condition) — non-manager authorized users cannot reach AWARENESS event dashboards without this.
- `app/events/[id]/settings/page.tsx` status `<select>` option — cannot set or correctly display AWARENESS status via UI without this.

**Should have (competitive/consistency):**
- `app/intelligence/subscribe/page.tsx` status badge — currently uses an independent inline ternary; AWARENESS falls through to grey fallback; aligning to `getStatusColor()` provides visual consistency.

**Defer (v2+):**
- Refactor all hardcoded status arrays across the codebase to derive from a shared `STATUS_DISPLAY_ORDER` constant — eliminates the need for multi-site updates on future status additions; out of scope for this milestone.

### Architecture Approach

The data flow is strictly top-down: PostgreSQL String field → Prisma passthrough → API routes (with OCCURRED-specific guards only) → TypeScript `EventStatus` type → React components via `getStatusColor()`. The architecture has one clear source of truth (`lib/status-colors.ts`) and one clear editability gate (`lib/events.ts → isEventEditable()`). The failure risk comes not from the architecture itself but from UI components that bypassed the canonical `getStatusColor()` function and hardcoded their own status logic.

**Major components and change requirements:**
1. `lib/status-colors.ts` — source of truth; add AWARENESS, reassign OCCURRED to slate; change first.
2. `lib/events.ts → isEventEditable()` — allowlist that gates all child-resource mutations; add AWARENESS or simplify to a negative check on OCCURRED only.
3. `app/events/page.tsx` — filter state, Clear Filters, checkbox loop, dashboard access gate, modal button; 5 distinct hardcoded locations, all must change atomically.
4. `app/events/[id]/settings/page.tsx` — status `<select>` dropdown; add AWARENESS option in display-order position (before PIPELINE).
5. `app/intelligence/subscribe/page.tsx` — independent inline badge; low-priority cleanup to use `getStatusColor()`.

### Critical Pitfalls

1. **Stale hardcoded filter arrays in `app/events/page.tsx`** — Three separate literal arrays (lines 40, 191, 257) must all be updated; updating `lib/status-colors.ts` alone does not fix these. Warning sign: create an AWARENESS event in dev, reload the portfolio — it does not appear.

2. **Settings page dropdown has no AWARENESS option** — If an event IS already in AWARENESS status and the user opens settings, the browser may silently snap the blank `<select>` value to the first option on save, overwriting the status to PIPELINE. Fix: add the `<option>` element before saving any AWARENESS event via the settings form.

3. **Dashboard access gate excludes AWARENESS** — Line 130 in `app/events/page.tsx` checks for `COMMITTED` or `OCCURRED`; non-manager authorized users get a blocking alert instead of dashboard navigation. Add `|| event.status === 'AWARENESS'` to the condition.

4. **OCCURRED color reassignment creates silent visual regressions** — Components not using `getStatusColor()` (notably `app/intelligence/subscribe/page.tsx`) will not pick up the OCCURRED → grey change automatically. Audit all hardcoded blue color references (`#3b82f6`, `text-blue-*`) against status rendering before deploying.

5. **Migration history drift on multi-event branch** — No DDL migration is needed, but `npx prisma migrate dev --name add-awareness-status` must still be run for migration history continuity. Skipping it causes `npm run build` (which runs `prisma migrate deploy`) to fail in production. Follow CLAUDE.md merge rules when merging main into multi-event.

## Implications for Roadmap

Based on research, the dependency chain dictates a strict build order. The implementation fits naturally into a single tightly-scoped phase because all changes are low-complexity and the files are few. However, a two-phase split is recommended to isolate the type/behavior foundation from the UI surface.

### Phase 1: Status Foundation

**Rationale:** `lib/status-colors.ts` is the root dependency for all downstream rendering and the TypeScript type. `lib/events.ts` is the root dependency for all API-level editability. These must be correct before any UI work is validated — if the color map is wrong, every badge is wrong; if `isEventEditable` is wrong, all child-resource API calls fail.

**Delivers:** AWARENESS defined as a valid `EventStatus` type; correct blue color assigned; OCCURRED reassigned to grey; AWARENESS events recognized as editable by all event-scoped API routes.

**Addresses:** Table-stakes features P1a (status-colors entry) and P1b (editability).

**Avoids:** Pitfall 3 (OCCURRED color regression — both changes land in the same commit), Pitfall 2 (`isEventEditable` ambiguity resolved).

**Files:**
- `lib/status-colors.ts` — add AWARENESS, reassign OCCURRED.
- `lib/events.ts` — add AWARENESS to allowlist or simplify to negative OCCURRED check.

**Research flag:** None needed — standard additive pattern with HIGH-confidence codebase inspection.

### Phase 2: UI Surface Updates

**Rationale:** Once the type foundation is in place, all UI changes are mechanical and independently verifiable. The settings dropdown and the events portfolio page must be done together because a user could set status to AWARENESS (settings) and then find it invisible in the portfolio (events page) if only one is done.

**Delivers:** Users can create/view/filter/set AWARENESS events through all primary UI surfaces. Non-manager authorized users can access AWARENESS event dashboards.

**Addresses:** Table-stakes features P1c (filter arrays), P1d (dashboard gate), P1e (settings dropdown).

**Avoids:** Pitfall 1 (stale filter arrays — all 3 locations updated atomically), Pitfall 4 (settings dropdown blank/overwrite), Pitfall 5 (dashboard access exclusion).

**Files:**
- `app/events/[id]/settings/page.tsx` — add AWARENESS `<option>`.
- `app/events/page.tsx` — update 3 filter arrays + 2 access gate conditions.

**Research flag:** None needed — all change sites identified with HIGH confidence.

### Phase 3: Cleanup and Verification

**Rationale:** The intelligence subscribe badge is functional without this change (grey fallback is not broken), but cosmetic consistency matters for a polished release. Tests and migration should be included in the same phase to avoid shipping without coverage.

**Delivers:** Full visual consistency across all status-rendering surfaces; automated test coverage for AWARENESS; clean migration history on multi-event branch.

**Addresses:** Should-have feature (intelligence subscribe badge); operational requirements (migration, tests).

**Avoids:** Pitfall 6 (migration drift), Pitfall 7 (no test coverage for AWARENESS).

**Files:**
- `app/intelligence/subscribe/page.tsx` — replace inline ternary with `getStatusColor()`.
- `tests/api/events.spec.ts` — add AWARENESS creation and editability test cases.
- `scripts/verify-occurred-lock.ts` — confirm AWARENESS passes editability check.
- Run `npx prisma migrate dev --name add-awareness-status` on multi-event branch.

**Research flag:** None needed — well-documented patterns.

### Phase Ordering Rationale

- Phase 1 before Phase 2: TypeScript will not compile correctly with AWARENESS in UI code if the type is not yet defined in `lib/status-colors.ts`. API editability must be correct before UI changes can be manually tested end-to-end.
- Phase 2 atomically: Settings dropdown and events portfolio page are tested together — an AWARENESS event set via settings must appear in the portfolio filter. Partial deployment creates a confusing intermediate state.
- Phase 3 last: Badge cleanup and test additions do not block functionality; they validate and polish what Phase 1 and 2 deliver. The migration can technically be run at any phase but should be done before production deployment.

### Research Flags

Phases likely needing deeper research during planning:
- None. All three phases are fully specified with exact file paths and line numbers from direct codebase inspection. No external API integrations, third-party library upgrades, or architectural decisions are involved.

Phases with standard patterns (skip research-phase):
- **All phases:** Direct codebase inspection with HIGH confidence. The change surface is completely mapped.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All files directly inspected; no external dependencies involved |
| Features | HIGH | Complete change inventory derived from full codebase scan |
| Architecture | HIGH | Data flow and component boundaries confirmed via source inspection |
| Pitfalls | HIGH | All pitfalls identified from actual code patterns, not theoretical risks |

**Overall confidence:** HIGH

### Gaps to Address

- **Dashboard access gate intent for non-managers:** PROJECT.md states AWARENESS events are "fully editable" but does not explicitly state that non-manager authorized users should have dashboard access. The research recommends including AWARENESS in the gate condition (consistent with the COMMITTED/OCCURRED pattern for authorized users), but this should be confirmed with the product owner before Phase 2 implementation.

- **`isEventEditable` allowlist vs. simplification:** The allowlist in `lib/events.ts` works correctly for AWARENESS via the DB-query fallback path, but is architecturally misleading. The research recommends simplifying the function to a pure `!== 'OCCURRED'` check. This is a behavior-equivalent refactor but introduces a surface area change — confirm whether it should be in scope for this milestone or deferred.

- **OpenClaw upcoming-event filter:** `app/api/webhooks/intel-report/route.ts` filters `status: { not: 'CANCELED' }` for upcoming events. AWARENESS events will appear in this feed. Whether that is the correct product behavior is not answered by the research and should be validated with the team.

## Sources

### Primary (HIGH confidence)

All sources are direct codebase inspections — no external references required for this brownfield change.

- `lib/status-colors.ts` — color map and EventStatus type derivation
- `lib/events.ts` — isEventEditable allowlist and editability gate
- `prisma/schema.prisma` — confirms `status` is `String` not enum
- `app/api/events/route.ts` — POST default and status passthrough
- `app/api/events/[id]/route.ts` — OCCURRED lock, COMMITTED gate, DELETE block
- `app/events/page.tsx` — filter arrays, badge rendering, dashboard access gate
- `app/events/[id]/settings/page.tsx` — status dropdown, isLocked check
- `app/events/[id]/dashboard/page.tsx` — event lock check, meeting status filters
- `app/events/[id]/attendees/page.tsx` — isLocked check
- `app/events/[id]/calendar/page.tsx` — isLocked check
- `components/reports/EventCalendar.tsx` — getStatusColor usage
- `components/reports/EventMap.tsx` — getStatusColor usage
- `app/intelligence/subscribe/page.tsx` — independent inline status badge
- `app/api/webhooks/intel-report/route.ts` — upcoming event filter
- `tests/api/events.spec.ts` — existing test coverage scope
- `scripts/verify-occurred-lock.ts` — existing verification scope
- `.planning/PROJECT.md` — milestone requirements and design decisions
- `CLAUDE.md` — multi-event branch merge rules and migration workflow

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
