# Retrospective

## Milestone: v1.0 — Add AWARENESS Status

**Shipped:** 2026-03-17
**Phases:** 2 | **Plans:** 2

### What Was Built

- AWARENESS EventStatus added as the first lifecycle stage (blue #3b82f6); OCCURRED reassigned to slate/grey
- `STATUS_DISPLAY_ORDER` constant exported from `lib/status-colors.ts` to drive ordered UI rendering
- `isEventEditable` made dynamic via `Object.keys(EVENT_STATUS_COLORS)` — eliminates maintenance burden for future statuses
- Events portfolio: filter, clear-filters, checkbox loop, and dashboard gate all updated via STATUS_DISPLAY_ORDER
- Settings page: Awareness appears as first dropdown option
- Jest + ts-jest unit test framework installed; 11 tests written and passing

### What Worked

- **Strict dependency ordering** (type foundation first, UI surfaces second) made Phase 2 trivial — no surprises
- **TDD for utility functions** (status-colors.ts) caught exact color values before any UI code ran
- **Dynamic Object.keys() pattern** was immediately adopted and is cleaner than the previous hardcoded array
- **Phase scope was minimal and well-defined** — each phase had 1 plan; execution was fast (12 min + 2 min)

### What Was Inefficient

- Prisma migration step (DB-01) required research/execution but produced no file — could have been specified as "confirm no migration needed" to avoid false ceremony
- Dead import in settings page introduced during Phase 2 (STATUS_DISPLAY_ORDER imported but not used) — minor but should have been caught

### Patterns Established

- `EventStatus` is `keyof typeof EVENT_STATUS_COLORS` — type expands automatically when new entries added
- Filter arrays in events portfolio: use `STATUS_DISPLAY_ORDER` spread instead of hardcoded arrays
- `isEventEditable`: derive valid statuses from EVENT_STATUS_COLORS keys; editability = "not OCCURRED"

### Key Lessons

1. When adding a new value to a type-driven system, start with the type source-of-truth before touching consumers
2. `Object.keys()` pattern for allowlists is strictly better than hardcoded arrays for open enums
3. Unit tests for color/style constants prevent regressions silently
4. Duplicate gate conditions (lines 130 + 561 in events/page.tsx) should be extracted immediately — tech debt compounds fast

### Cost Observations

- Model mix: 100% sonnet
- Sessions: 2 (one per phase)
- Notable: Phase 2 completed in 2 minutes — direct consequence of clean Phase 1 foundation

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Avg Min/Plan |
|-----------|--------|-------|------|--------------|
| v1.0 — Add AWARENESS Status | 2 | 2 | 1 | 7 min |
