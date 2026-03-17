---
phase: 2
slug: ui-surface-and-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29 |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npx jest lib/__tests__/ --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest lib/__tests__/ --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | PORT-01, PORT-02, PORT-03, PORT-04 | unit | `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | PORT-01, PORT-02, PORT-03 | unit | `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | PORT-04 | unit | `npx jest lib/__tests__/events-page-logic.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 1 | SETT-01 | manual | Visual inspection / build check | manual-only | ⬜ pending |
| 2-01-05 | 01 | 1 | DB-01 | manual | `npx prisma migrate status` | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/__tests__/events-page-logic.test.ts` — stubs for PORT-01, PORT-02, PORT-03, PORT-04

The existing `lib/__tests__/status-colors.test.ts` covers Phase 1 foundation and already passes. No changes needed to it.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings dropdown shows "Awareness" as first option | SETT-01 | React `<option>` order is a render/snapshot concern; snapshot tests not in scope | Load event settings page, confirm "Awareness" is first in the status dropdown |
| Migration clean on multi-event branch | DB-01 | CLI operation; migration creation is not unit-testable | Run `npx prisma migrate status` — should report "Database schema is up to date" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
