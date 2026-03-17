# Milestones

## v1.0 Add AWARENESS Status (Shipped: 2026-03-17)

**Phases completed:** 2 phases, 2 plans, 4 tasks
**Files modified:** 13 | **Lines:** +1,225 / -26
**Git range:** `28c7866` → `f7b3050`

**Delivered:** AWARENESS is a fully functional first-stage event status with blue colors, ordered display, dynamic editability, and full UI surface propagation.

**Key accomplishments:**
1. AWARENESS EventStatus added with blue palette (#3b82f6); OCCURRED reassigned to slate/grey
2. `STATUS_DISPLAY_ORDER` constant exported — drives ordered filter and dropdown rendering
3. `isEventEditable` made dynamic via `Object.keys(EVENT_STATUS_COLORS)` — future statuses auto-included
4. Events portfolio filter uses STATUS_DISPLAY_ORDER (5 statuses, no hardcoded arrays)
5. Non-manager users can view dashboard for AWARENESS events (gate updated)
6. Jest + ts-jest unit test framework installed with 11 passing tests

**Tech debt noted:**
- Dead `STATUS_DISPLAY_ORDER` import in settings page (static options kept)
- Duplicate dashboard gate conditions (lines 130 + 561 in events/page.tsx)
- INTEL-01 deferred: intelligence subscribe page still uses hardcoded status ternary

---

