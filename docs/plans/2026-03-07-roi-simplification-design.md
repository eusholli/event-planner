# ROI Dashboard Simplification Design

**Date:** 2026-03-07
**Branch:** multi-event
**Status:** Approved

## Overview

Simplify the ROI Dashboard by consolidating meeting and engagement targets into fewer fields, tightening role-based access control, adding a Reject workflow, locking approved targets, and gating COMMITTED event status behind ROI approval.

---

## Section 1: Schema Changes

Modify `EventROITargets` in `prisma/schema.prisma`:

**Remove:**
- `targetBoothMeetings Int?`
- `targetCLevelMeetingsMin Int?`
- `targetCLevelMeetingsMax Int?`
- `targetOtherMeetings Int?`
- `targetSocialReach Int?`
- `targetKeynotes Int?`
- `targetSeminars Int?`
- `targetBoothSessions Int?`
- `actualSocialReach Int?`
- `actualKeynotes Int?`
- `actualSeminars Int?`
- `actualBoothSessions Int?`

**Add:**
- `targetCustomerMeetings Int?` — single target for all customer meetings
- `targetTargetedReach Int?` — replaces targetSocialReach
- `targetSpeaking Int?` — replaces targetKeynotes + targetSeminars + targetBoothSessions combined
- `actualTargetedReach Int?` — replaces actualSocialReach
- `actualSpeaking Int?` — replaces actualKeynotes + actualSeminars + actualBoothSessions combined
- `rejectedBy String?` — userId of root user who rejected
- `rejectedAt DateTime?` — timestamp of rejection

**Unchanged:**
- `targetMediaPR Int?`
- `actualMediaPR Int?`
- All financial fields, approval fields, status, timestamps

Requires a Prisma migration: `npx prisma migrate dev --name simplify-roi-fields`

---

## Section 2: Targets & Approval Tab UI

**File:** `app/events/[id]/roi/page.tsx`

### Label change
- "Target Budget ($)" → "Budget ($)" (Financial Targets box, same underlying field)

### Consolidated "Event Targets" box
Replaces the two separate "Meeting KPI Targets" and "Engagement Targets" boxes with one "Event Targets" box containing four fields:
- Customer Meetings (`targetCustomerMeetings`)
- Targeted Reach (`targetTargetedReach`)
- Speaking (`targetSpeaking`)
- Media/PR (`targetMediaPR`)

### Access control
- All fields in Targets & Approval are **editable only for `marketing` or `root`** roles; other roles see read-only display
- "Save Targets" button: only shown to `marketing`/`root`; **disabled until all required fields are filled**: Budget, Requester Email, Expected Pipeline, Win Rate, Customer Meetings, Targeted Reach, Speaking, Media/PR
- "Submit for Approval": only shown to `marketing`/`root`; visible when status is `DRAFT`
- "Approve": only shown to `root`; visible when status is `SUBMITTED`
- "Reject": only shown to `root`; visible when status is `SUBMITTED`; sends status back to `DRAFT`, records `rejectedBy`/`rejectedAt`
- **Once status is `APPROVED`: entire Targets & Approval tab is locked read-only** — no inputs, no save/submit buttons

---

## Section 3: Event Execution Tab

**File:** `app/events/[id]/roi/page.tsx` (actuals tab)

Rename section header from "Speaking & Social Actuals" to "Engagement Actuals".

Replace 5 fields with 3:
- **Targeted Reach** (`actualTargetedReach`) — replaces Social Reach
- **Speaking** (`actualSpeaking`) — replaces Keynotes + Seminars + Booth Sessions
- **Media/PR** (`actualMediaPR`) — unchanged

Save access remains `canWrite` (root/admin/marketing).

---

## Section 4: Performance Tracker Tab

**File:** `app/events/[id]/roi/page.tsx` (performance tab)

### Meeting KPIs section
Replace the multi-bar breakdown with a single "Customer Meetings" progress bar: `actualTotalMeetings` vs `targetCustomerMeetings`.

### Engagement section
Replace 5 metric cards with 3:
- Targeted Reach (`actualTargetedReach` vs `targetTargetedReach`)
- Speaking (`actualSpeaking` vs `targetSpeaking`)
- Media/PR (`actualMediaPR` vs `targetMediaPR`)

Financial Performance and Target Companies sections unchanged.

---

## Section 5: Event Settings — COMMITTED Status Gate

**File:** `app/api/events/[id]/route.ts` (PUT handler)

When saving an event with `status: 'COMMITTED'`:
1. Fetch `event.roiTargets` (select `status` only)
2. If `roiTargets` does not exist or `roiTargets.status !== 'APPROVED'`, return HTTP 400 with:
   `"Event cannot be set to Committed until the ROI Dashboard has been approved."`
3. The settings page (`app/events/[id]/settings/page.tsx`) already displays API error messages — no additional frontend change needed beyond surfacing the error text

---

## Section 6: Import/Export & JSON Backups

### Export (`app/api/admin/system/export/route.ts`)
- Serialize new field names in `roiTargets` payload
- Update version string: `'4.0-company-model'` → `'5.0-simplified-roi'`

### Import (`app/api/admin/system/import/route.ts`)
- Write new field names to DB
- Backwards-compatibility mapping for old-format JSON:
  - `targetBoothMeetings` → `targetCustomerMeetings`
  - `targetSocialReach` → `targetTargetedReach`
  - `targetKeynotes` → `targetSpeaking` (targetSeminars and targetBoothSessions discarded)
  - `actualSocialReach` → `actualTargetedReach`
  - `actualKeynotes` → `actualSpeaking` (actualSeminars and actualBoothSessions discarded)

### Existing backup JSON files
No content changes required. Both backup files have `roiTargets: null` for all events and remain valid for import.

### Actions (`lib/actions/roi.ts`)
- Update `ROITargetsInput` interface to use new field names
- Update `saveROITargets`, `getROIActuals`, `getROITargets` to use new fields
- Add `rejectROI(eventId, rejectorUserId)` action

### API route (`app/api/events/[id]/roi/route.ts`)
- Add `action: 'reject'` handler (root only)
- Change `submit` authorization from `canWrite` to `canManageEvents`
- Change `approve` authorization from `canManageEvents` to `isRootUser`

---

## Files Affected

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Remove 12 fields, add 7 fields |
| `prisma/migrations/` | New migration for schema change |
| `lib/actions/roi.ts` | Update types, actions, add rejectROI |
| `app/api/events/[id]/roi/route.ts` | Add reject action, tighten auth |
| `app/api/events/[id]/route.ts` | Add COMMITTED status gate |
| `app/events/[id]/roi/page.tsx` | Full UI restructure per design |
| `app/api/admin/system/export/route.ts` | New field names, version bump |
| `app/api/admin/system/import/route.ts` | New fields + backwards-compat mapping |
