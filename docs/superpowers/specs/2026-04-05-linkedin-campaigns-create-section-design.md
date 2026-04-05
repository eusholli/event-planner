# Design: LinkedIn Campaigns — "Create Campaign" Section

**Date:** 2026-04-05  
**Status:** Approved

---

## Context

The LinkedIn Campaigns page (`/events/[id]/linkedin-campaigns`) currently shows only a list of saved drafts. Creating a new LinkedIn campaign requires navigating to the ROI Dashboard, selecting target companies there, then clicking "Draft LinkedIn Article." This is a detour — users on the campaigns page have no in-context way to start a new campaign.

This change adds a "Create Campaign" section at the top of the LinkedIn Campaigns page so users can initiate campaigns directly, with or without pre-selected ROI target companies.

---

## Architecture

### Files Modified

| File | Change |
|------|--------|
| `app/events/[id]/linkedin-campaigns/page.tsx` | Add "Create Campaign" section, ROI fetch, selection state |
| `components/roi/LinkedInModal.tsx` | Add `initialPhase` and `initialBrief` props |

### Files Unchanged

- `app/events/[id]/roi/page.tsx` — untouched; existing company selection flow unaffected
- All API routes — no changes needed

---

## Feature Design

### 1. "Create Campaign" Section (LinkedIn Campaigns page)

Rendered above the existing draft list.

**Data:** On mount, fetch `/api/events/{eventId}/roi` (existing endpoint) alongside the existing `/api/social/drafts` fetch. Extract `targets.targetCompanies` to populate the company list.

**UI elements:**
- Heading: "Create Campaign"
- Target company badges — clickable pill buttons that toggle selection. Selected state: blue highlight + checkmark (matching ROI page visual style). Max 5 selectable; warning shown at limit.
- "Clear selection" link — visible when `selectedForLinkedIn.size > 0`
- Fallback note when no ROI target companies exist: muted text "Add target companies on the ROI page to use them here."
- "Draft LinkedIn Article" button — **always enabled**. Label: "Draft LinkedIn Article (N companies)" when N > 0, "Draft LinkedIn Article" when N = 0.

**State variables added:**
```typescript
const [targetCompanies, setTargetCompanies] = useState<Company[]>([])
const [selectedForLinkedIn, setSelectedForLinkedIn] = useState<Set<string>>(new Set())
const [linkedInModalOpen, setLinkedInModalOpen] = useState(false)
```

`Company` type: `{ id: string; name: string; pipelineValue?: number | null }`

**Button click handler:**
- `selectedForLinkedIn.size > 0` → open modal (default `brief-loading` phase)
- `selectedForLinkedIn.size === 0` → open modal with `initialPhase="params"` and `initialBrief=""`

**Modal close handler:** clears `selectedForLinkedIn`, sets `linkedInModalOpen` to false.

---

### 2. `LinkedInModal` Modifications

Two new optional props added:

```typescript
initialPhase?: 'brief-loading' | 'params'  // default: 'brief-loading'
initialBrief?: string                        // default: ''
```

The internal phase state is initialized to `initialPhase` rather than hardcoding `'brief-loading'`. When starting at `'params'`, the brief text area is pre-populated with `initialBrief`.

No other modal logic changes. Existing callers (ROI page) pass neither prop and retain identical behavior.

---

## Behavior Summary

| User action | Modal opens at | Brief content |
|-------------|---------------|---------------|
| 1–5 companies selected | `brief-loading` → fetches AI brief | AI-generated from company names |
| 0 companies selected | `params` (skips brief-loading) | Empty — user types freely |

---

## Verification

1. Navigate to `/events/{id}/linkedin-campaigns`
2. Confirm "Create Campaign" section appears above draft list
3. If event has ROI target companies: verify badges render, clicking toggles selection with blue highlight, 6th click shows max warning
4. Click "Draft LinkedIn Article" with 1–2 companies selected → modal opens at brief-loading phase, brief is fetched and populated
5. Clear selection, click "Draft LinkedIn Article" with 0 companies → modal opens directly at params phase with blank brief text area
6. Complete a draft from each path and confirm it saves correctly to the drafts list
7. Navigate to the ROI page and confirm existing company selection + modal flow is unaffected
8. Verify on an event with no ROI target companies: fallback note is shown, button still opens modal at params phase
