# Requirements: Event Planner — Add AWARENESS Status

**Defined:** 2026-03-17
**Core Value:** Events in the awareness phase are tracked and visible without cluttering the active pipeline

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Status Foundation

- [x] **FOUND-01**: `lib/status-colors.ts` adds AWARENESS entry with blue bg (#3b82f6), blue-700 text, blue-100 border
- [x] **FOUND-02**: `lib/status-colors.ts` reassigns OCCURRED to grey/slate colors (from blue) in the same change
- [x] **FOUND-03**: `lib/status-colors.ts` exports a `STATUS_DISPLAY_ORDER` constant: `['AWARENESS', 'PIPELINE', 'COMMITTED', 'CANCELED', 'OCCURRED']`
- [x] **FOUND-04**: `lib/events.ts` `isEventEditable` allowlist includes `'AWARENESS'` so AWARENESS events are fully editable via the fast-path check

### UI — Events Portfolio Page

- [ ] **PORT-01**: Filter state initialization array in `app/events/page.tsx` includes `'AWARENESS'`
- [ ] **PORT-02**: "Clear Filters" reset handler array in `app/events/page.tsx` includes `'AWARENESS'`
- [ ] **PORT-03**: Filter checkbox rendering loop in `app/events/page.tsx` includes `'AWARENESS'`
- [ ] **PORT-04**: "View Dashboard" modal access gate in `app/events/page.tsx` includes `AWARENESS` (allows non-manager users to view dashboard for AWARENESS events)

### UI — Event Settings Page

- [ ] **SETT-01**: Status `<select>` dropdown in `app/events/[id]/settings/page.tsx` includes `<option value="AWARENESS">Awareness</option>` as the first option

### Database

- [ ] **DB-01**: Prisma migration created with `prisma migrate dev --name add-awareness-status` (no DDL change; required for build continuity on multi-event branch)

## v2 Requirements

### Intelligence Subscribe Page

- **INTEL-01**: `app/intelligence/subscribe/page.tsx` status badge replaced with `getStatusColor()` call to be consistent with the rest of the app (currently uses a hardcoded inline ternary that won't show AWARENESS in blue)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Forced state transitions | User specified any-to-any transitions allowed |
| MeetingStatus changes | Only Event.status is in scope |
| UI redesign | Badge color changes only |
| Mobile-specific changes | Web app only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| PORT-01 | Phase 2 | Pending |
| PORT-02 | Phase 2 | Pending |
| PORT-03 | Phase 2 | Pending |
| PORT-04 | Phase 2 | Pending |
| SETT-01 | Phase 2 | Pending |
| DB-01 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap creation*
