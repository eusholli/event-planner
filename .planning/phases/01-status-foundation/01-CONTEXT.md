# Phase 1: Status Foundation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add AWARENESS as a fully valid EventStatus type with correct colors, correct display order, and recognized as editable by all event-scoped API routes. Changes are confined to `lib/status-colors.ts` and `lib/events.ts`. Nothing user-visible — Phase 2 builds on this foundation.

</domain>

<decisions>
## Implementation Decisions

### OCCURRED color reassignment
- Use **slate** palette (blue-tinted grey, intentionally muted)
- `bg`: #64748b (slate-500)
- `text`: #334155 (slate-700)
- `border`: #f1f5f9 (slate-100)
- `markerColor`: #64748b
- `className`: `bg-slate-50 text-slate-700 border border-slate-100`

### AWARENESS colors
- As specified in FOUND-01: blue (#3b82f6) — taking over from OCCURRED
- `bg`: #3b82f6 (blue-500)
- `text`: #1d4ed8 (blue-700)
- `border`: #dbeafe (blue-100)
- `markerColor`: #3b82f6
- `className`: `bg-blue-50 text-blue-700 border border-blue-100`

### STATUS_DISPLAY_ORDER
- Export from `lib/status-colors.ts`: `['AWARENESS', 'PIPELINE', 'COMMITTED', 'CANCELED', 'OCCURRED']`
- As specified in FOUND-03

### Claude's Discretion
- `isEventEditable` fast-path detection: derive allowlist from `Object.keys(EVENT_STATUS_COLORS)` instead of a hardcoded array — this stays in sync automatically when new statuses are added. Actual editability check remains `!== 'OCCURRED'`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — FOUND-01 through FOUND-04 define exact file targets and acceptance criteria for this phase

### Existing source files
- `lib/status-colors.ts` — Primary source of truth for EventStatus types and colors; this file is the main target for Phase 1
- `lib/events.ts` — `isEventEditable` function; needs AWARENESS in the fast-path detection list

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EVENT_STATUS_COLORS` const map in `lib/status-colors.ts` — add AWARENESS entry and update OCCURRED entry
- `getStatusColor()` function — already handles dynamic lookup; no changes needed
- `EventStatus` type — derived from `keyof typeof EVENT_STATUS_COLORS`; automatically expands when AWARENESS is added

### Established Patterns
- Color entry shape: `{ bg, text, border, className, markerColor }` — follow existing entries exactly
- `className` pattern: `bg-{color}-50 text-{color}-700 border border-{color}-100`
- `isEventEditable` dual-path: string fast-path (detect status by allowlist, return `!== 'OCCURRED'`), then DB lookup for IDs

### Integration Points
- `lib/status-colors.ts` exports `EventStatus` type derived from the map — type expands automatically
- `STATUS_DISPLAY_ORDER` is a new export; Phase 2 will consume it for dropdown ordering and filter rendering

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

*Phase: 01-status-foundation*
*Context gathered: 2026-03-17*
