# ROI Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate ROI targets into fewer fields, add Reject workflow, tighten role-based access, lock approved targets, and gate COMMITTED event status behind ROI approval.

**Architecture:** Schema migration removes 12 granular fields and adds 7 new ones; the ROI page UI is restructured to match; the event PUT API gains an ROI-approval gate; import/export code is updated with backwards-compatibility.

**Tech Stack:** Next.js 16 App Router, Prisma (PostgreSQL), Clerk auth, TypeScript, Tailwind CSS

**Design doc:** `docs/plans/2026-03-07-roi-simplification-design.md`

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Edit the `EventROITargets` model**

Open `prisma/schema.prisma` and find the `EventROITargets` model (around line 112).

Replace the `// Meeting KPIs` and `// Engagement` and `// Actuals` sections with the new fields. The full updated block for those sections should be:

```prisma
  // Meeting KPIs
  targetCustomerMeetings  Int?

  // Engagement
  targetTargetedReach     Int?
  targetSpeaking          Int?
  targetMediaPR           Int?

  // Target Companies
  targetCompanies         Company[] @relation("TargetCompanies")

  // Actuals (manually entered)
  actualTargetedReach     Int?
  actualSpeaking          Int?
  actualMediaPR           Int?

  // Approval
  status                  String   @default("DRAFT")
  approvedBy              String?
  approvedAt              DateTime?
  submittedAt             DateTime?
  rejectedBy              String?
  rejectedAt              DateTime?
```

Remove these fields entirely:
- `targetBoothMeetings`, `targetCLevelMeetingsMin`, `targetCLevelMeetingsMax`, `targetOtherMeetings`
- `targetSocialReach`, `targetKeynotes`, `targetSeminars`, `targetBoothSessions`
- `actualSocialReach`, `actualKeynotes`, `actualSeminars`, `actualBoothSessions`

Also remove `targetInvestment Float?` (it was unused — the UI uses `budget` on the Event model instead).

**Step 2: Run the migration**

```bash
npx prisma migrate dev --name simplify-roi-fields
```

Expected: migration file created, client regenerated, no errors.

**Step 3: Verify client regenerated**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client" message.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: simplify ROI schema - consolidate meeting/engagement targets"
```

---

## Task 2: Update Server Actions (`lib/actions/roi.ts`)

**Files:**
- Modify: `lib/actions/roi.ts`

**Step 1: Update `ROITargetsInput` interface**

Replace the old granular fields with the new ones. The new interface should be:

```typescript
export interface ROITargetsInput {
    expectedPipeline?: number | null
    winRate?: number | null
    expectedRevenue?: number | null
    targetCustomerMeetings?: number | null
    targetTargetedReach?: number | null
    targetSpeaking?: number | null
    targetMediaPR?: number | null
    targetCompanyIds?: string[]
    actualTargetedReach?: number | null
    actualSpeaking?: number | null
    actualMediaPR?: number | null
    budget?: number | null
    requesterEmail?: string | null
}
```

**Step 2: Update `ROIActuals` interface**

Replace the old actual fields:

```typescript
export interface ROIActuals {
    actualInvestment: number
    actualPipeline: number
    actualRevenue: number
    actualCustomerMeetings: number
    targetCompaniesHit: { id: string; name: string }[]
    targetCompaniesHitCount: number
    actualTargetedReach: number
    actualSpeaking: number
    actualMediaPR: number
}
```

**Step 3: Update `saveROITargets`**

The `saveROITargets` function destructures fields to split event-level vs ROI-level saves. Update it so the destructure uses the new field names. The rest field spread will automatically include `targetCustomerMeetings`, `targetTargetedReach`, `targetSpeaking`, `targetMediaPR`, `actualTargetedReach`, `actualSpeaking`, `actualMediaPR`.

Remove `targetInvestment` from any references.

**Step 4: Update `getROIActuals`**

Replace old actual calculations with new ones. The new return block should be:

```typescript
const actualCustomerMeetings = meetings.length  // all confirmed/occurred meetings

return {
    actualInvestment: event?.budget || 0,
    actualPipeline,
    actualRevenue: actualPipeline * (roiTargets?.winRate || 0),
    actualCustomerMeetings,
    targetCompaniesHit,
    targetCompaniesHitCount: targetCompaniesHit.length,
    actualTargetedReach: roiTargets?.actualTargetedReach || 0,
    actualSpeaking: roiTargets?.actualSpeaking || 0,
    actualMediaPR: roiTargets?.actualMediaPR || 0,
}
```

**Step 5: Add `rejectROI` action**

Add after `approveROI`:

```typescript
export async function rejectROI(eventId: string, rejectorUserId: string) {
    const { isRootUser } = await import('@/lib/roles')
    if (!await isRootUser()) throw new Error('Forbidden')

    return prisma.eventROITargets.update({
        where: { eventId },
        data: {
            status: 'DRAFT',
            rejectedBy: rejectorUserId,
            rejectedAt: new Date(),
        },
        include: { targetCompanies: true }
    })
}
```

**Step 6: Commit**

```bash
git add lib/actions/roi.ts
git commit -m "feat: update ROI actions for simplified schema"
```

---

## Task 3: Update ROI API Route (`app/api/events/[id]/roi/route.ts`)

**Files:**
- Modify: `app/api/events/[id]/roi/route.ts`

**Step 1: Add `rejectROI` to imports**

```typescript
import {
    saveROITargets,
    getROITargets,
    getROIActuals,
    submitROIForApproval,
    approveROI,
    rejectROI,
} from '@/lib/actions/roi'
import { canWrite, canManageEvents, isRootUser } from '@/lib/roles'
```

**Step 2: Tighten `submit` authorization**

Change the `submit` action guard from `canWrite` to `canManageEvents`:

```typescript
if (action === 'submit') {
    if (!await canManageEvents()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const result = await submitROIForApproval(id)
    return NextResponse.json(result)
}
```

**Step 3: Tighten `approve` authorization to root only**

```typescript
if (action === 'approve') {
    if (!await isRootUser()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { userId } = await auth()
    const result = await approveROI(id, userId || 'system')
    return NextResponse.json(result)
}
```

**Step 4: Add `reject` action**

```typescript
if (action === 'reject') {
    if (!await isRootUser()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { userId } = await auth()
    const result = await rejectROI(id, userId || 'system')
    return NextResponse.json(result)
}
```

**Step 5: Commit**

```bash
git add app/api/events/[id]/roi/route.ts
git commit -m "feat: add reject action, tighten ROI auth to root for approve"
```

---

## Task 4: COMMITTED Status Gate in Event API

**Files:**
- Modify: `app/api/events/[id]/route.ts`

**Step 1: Locate the COMMITTED validation block**

Find the block around line 134:
```typescript
if (finalStatus === 'COMMITTED') {
    if (!finalStartDate || !finalEndDate || !finalAddress || finalAddress.trim() === '') {
```

**Step 2: Add ROI approval check inside that block**

Extend the block to also check ROI status:

```typescript
if (finalStatus === 'COMMITTED') {
    if (!finalStartDate || !finalEndDate || !finalAddress || finalAddress.trim() === '') {
        return NextResponse.json({
            error: 'Committed events must have Start Date, End Date, and Address'
        }, { status: 400 })
    }
    // Check ROI approval
    const roiRecord = await prisma.eventROITargets.findUnique({
        where: { eventId: id },
        select: { status: true }
    })
    if (!roiRecord || roiRecord.status !== 'APPROVED') {
        return NextResponse.json({
            error: 'Event cannot be set to Committed until the ROI Dashboard has been approved.'
        }, { status: 400 })
    }
}
```

Note: `id` is the resolved event UUID available in this scope (check the variable name in the existing code — it is `id`).

**Step 3: Commit**

```bash
git add app/api/events/[id]/route.ts
git commit -m "feat: block COMMITTED status if ROI not approved"
```

---

## Task 5: Update ROI Page UI (`app/events/[id]/roi/page.tsx`)

This is the largest task. Work through it in sub-steps.

**Files:**
- Modify: `app/events/[id]/roi/page.tsx`

### 5a: Update TypeScript interfaces

Replace `ROITargets` interface with:

```typescript
interface ROITargets {
    id?: string
    budget?: number | null
    requesterEmail?: string | null
    expectedPipeline: number | null
    winRate: number | null
    expectedRevenue: number | null
    targetCustomerMeetings: number | null
    targetTargetedReach: number | null
    targetSpeaking: number | null
    targetMediaPR: number | null
    targetCompanies: Company[]
    actualTargetedReach: number | null
    actualSpeaking: number | null
    actualMediaPR: number | null
    status: string
    approvedBy?: string | null
    approvedAt?: string | null
    submittedAt?: string | null
    rejectedBy?: string | null
    rejectedAt?: string | null
}
```

Replace `ROIActuals` interface with:

```typescript
interface ROIActuals {
    actualInvestment: number
    actualPipeline: number
    actualRevenue: number
    actualCustomerMeetings: number
    targetCompaniesHit: { id: string; name: string }[]
    targetCompaniesHitCount: number
    actualTargetedReach: number
    actualSpeaking: number
    actualMediaPR: number
}
```

Replace `emptyTargets`:

```typescript
const emptyTargets: ROITargets = {
    budget: null,
    requesterEmail: '',
    expectedPipeline: null,
    winRate: null,
    expectedRevenue: null,
    targetCustomerMeetings: null,
    targetTargetedReach: null,
    targetSpeaking: null,
    targetMediaPR: null,
    targetCompanies: [],
    actualTargetedReach: null,
    actualSpeaking: null,
    actualMediaPR: null,
    status: 'DRAFT',
}
```

### 5b: Update role checks

Find:
```typescript
const canApprove = canManageEventsCheck(role)
```
Replace with:
```typescript
const canEdit = role === 'root' || role === 'marketing'
const canApproveOrReject = role === 'root'
```

The import for `canManageEventsCheck` can be removed if no longer used.

### 5c: Update `handleSaveTargets`

The destructure that strips status/id/etc. should now omit the old fields. The spread will naturally include the new field names since they're on the `targets` object.

Also update `handleSaveActuals` to use new field names:

```typescript
const handleSaveActuals = async () => {
    setSaving(true)
    setMessage('')
    try {
        const res = await fetch(`/api/events/${eventId}/roi`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actualTargetedReach: targets.actualTargetedReach,
                actualSpeaking: targets.actualSpeaking,
                actualMediaPR: targets.actualMediaPR,
            }),
        })
        if (!res.ok) throw new Error('Failed to save')
        setMessage('Actuals saved successfully')
        const roiRes = await fetch(`/api/events/${eventId}/roi`)
        const data = await roiRes.json()
        if (data.actuals) setActuals(data.actuals)
    } catch (err: any) {
        setMessage(err.message)
    } finally {
        setSaving(false)
    }
}
```

### 5d: Add `handleReject`

```typescript
const handleReject = async () => {
    try {
        const res = await fetch(`/api/events/${eventId}/roi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reject' }),
        })
        if (!res.ok) throw new Error('Failed to reject')
        const result = await res.json()
        setTargets(result)
        setMessage('ROI targets rejected and returned for changes')
    } catch (err: any) {
        setMessage(err.message)
    }
}
```

### 5e: Add `allFieldsFilled` validation

Add a computed boolean used to disable Save Targets:

```typescript
const allFieldsFilled =
    !!targets.budget &&
    !!targets.requesterEmail &&
    !!targets.expectedPipeline &&
    !!targets.winRate &&
    targets.targetCustomerMeetings !== null && targets.targetCustomerMeetings !== undefined &&
    targets.targetTargetedReach !== null && targets.targetTargetedReach !== undefined &&
    targets.targetSpeaking !== null && targets.targetSpeaking !== undefined &&
    targets.targetMediaPR !== null && targets.targetMediaPR !== undefined
```

### 5f: Update `statusConfig`

Add `DRAFT` with rejected styling when `rejectedAt` is set. A simple approach is to add a helper:

```typescript
const statusConfig = {
    DRAFT: { color: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Draft' },
    SUBMITTED: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Submitted for Approval' },
    APPROVED: { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Approved' },
    REJECTED: { color: 'bg-red-100 text-red-800 border-red-200', label: 'Rejected — Changes Required' },
}

// Derive display status: show REJECTED label if in DRAFT but has rejectedAt
const displayStatus = targets.status === 'DRAFT' && targets.rejectedAt ? 'REJECTED' : targets.status
const statusStyle = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.DRAFT
```

### 5g: Rewrite Targets & Approval tab JSX

Replace the "Meeting KPI Targets" and "Engagement Targets" sections with one "Event Targets" section. Also rename "Target Budget ($)" to "Budget ($)".

The new "Event Targets" section:

```tsx
{/* Event Targets */}
<section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
    <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-violet-500 rounded-full" />
        Event Targets
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Customer Meetings</label>
            <input type="number" value={targets.targetCustomerMeetings ?? ''} readOnly={isLocked} onChange={e => setTargets(prev => ({ ...prev, targetCustomerMeetings: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm ${isLocked ? 'bg-zinc-50 border-zinc-100 text-zinc-600' : 'border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500'}`} placeholder="20" />
        </div>
        <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Targeted Reach</label>
            <input type="number" value={targets.targetTargetedReach ?? ''} readOnly={isLocked} onChange={e => setTargets(prev => ({ ...prev, targetTargetedReach: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm ${isLocked ? 'bg-zinc-50 border-zinc-100 text-zinc-600' : 'border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500'}`} placeholder="50,000" />
        </div>
        <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Speaking</label>
            <input type="number" value={targets.targetSpeaking ?? ''} readOnly={isLocked} onChange={e => setTargets(prev => ({ ...prev, targetSpeaking: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm ${isLocked ? 'bg-zinc-50 border-zinc-100 text-zinc-600' : 'border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500'}`} placeholder="5" />
        </div>
        <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Media / PR</label>
            <input type="number" value={targets.targetMediaPR ?? ''} readOnly={isLocked} onChange={e => setTargets(prev => ({ ...prev, targetMediaPR: e.target.value ? parseInt(e.target.value) : null }))}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm ${isLocked ? 'bg-zinc-50 border-zinc-100 text-zinc-600' : 'border-zinc-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500'}`} placeholder="5" />
        </div>
    </div>
</section>
```

Where `isLocked` is defined as:
```typescript
const isLocked = targets.status === 'APPROVED'
```

Apply `isLocked` and `readOnly={isLocked}` (or `disabled`) to **all** Financial Targets inputs too when `isLocked` is true.

### 5h: Update Action Buttons

Replace the action buttons block:

```tsx
{/* Action Buttons */}
<div className="flex items-center gap-3 pt-2">
    {canEdit && !isLocked && (
        <button onClick={handleSaveTargets} disabled={saving || !allFieldsFilled}
            className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm">
            <Save className="w-4 h-4" />
            Save Targets
        </button>
    )}
    {targets.id && targets.status === 'DRAFT' && canEdit && (
        <button onClick={handleSubmit}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
            <Send className="w-4 h-4" />
            Submit for Approval
        </button>
    )}
    {targets.id && targets.status === 'SUBMITTED' && canApproveOrReject && (
        <>
            <button onClick={handleApprove}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm">
                <CheckCircle className="w-4 h-4" />
                Approve
            </button>
            <button onClick={handleReject}
                className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm">
                <X className="w-4 h-4" />
                Reject
            </button>
        </>
    )}
    {isLocked && (
        <p className="text-sm text-emerald-700 font-medium flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Targets approved and locked
        </p>
    )}
</div>
```

### 5i: Update Performance Tracker tab

Replace the "Meeting KPIs" section with a single bar, and replace the "Engagement" section with 3 metric cards:

```tsx
{/* Meeting KPIs */}
<section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
    <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
        <span className="w-1 h-5 bg-violet-500 rounded-full" />
        Meeting KPIs
    </h3>
    <div className="space-y-5">
        <ProgressBar label="Customer Meetings" value={actuals.actualCustomerMeetings} max={targets.targetCustomerMeetings || 0} />
    </div>
</section>

{/* Engagement */}
<section>
    <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-rose-500 rounded-full" />
        Engagement
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Targeted Reach" target={targets.targetTargetedReach || 0} actual={actuals.actualTargetedReach} />
        <MetricCard label="Speaking" target={targets.targetSpeaking || 0} actual={actuals.actualSpeaking} />
        <MetricCard label="Media / PR" target={targets.targetMediaPR || 0} actual={actuals.actualMediaPR} />
    </div>
</section>
```

### 5j: Update Event Execution tab

Rename section and update fields:

```tsx
<section className="bg-white/70 backdrop-blur-sm border border-zinc-200/60 rounded-2xl p-6 shadow-sm">
    <h3 className="text-lg font-semibold text-zinc-900 mb-2 flex items-center gap-2">
        <span className="w-1 h-5 bg-rose-500 rounded-full" />
        Engagement Actuals
    </h3>
    <p className="text-sm text-zinc-500 mb-6">Enter the actual metrics that can&apos;t be auto-calculated from meeting data.</p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Targeted Reach</label>
            <input type="number" value={targets.actualTargetedReach ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualTargetedReach: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
        </div>
        <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Speaking</label>
            <input type="number" value={targets.actualSpeaking ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualSpeaking: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
        </div>
        <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Media / PR</label>
            <input type="number" value={targets.actualMediaPR ?? ''} onChange={e => setTargets(prev => ({ ...prev, actualMediaPR: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm" placeholder="0" />
        </div>
    </div>
</section>
```

**Step 2: Commit**

```bash
git add app/events/[id]/roi/page.tsx
git commit -m "feat: restructure ROI UI - consolidated targets, role gates, reject button"
```

---

## Task 6: Update Export Route

**Files:**
- Modify: `app/api/admin/system/export/route.ts`

**Step 1: Update version string**

Change:
```typescript
version: '4.0-company-model'
```
To:
```typescript
version: '5.0-simplified-roi'
```

**Step 2: Verify roiTargets serialization**

The export route spreads `event.roiTargets` after removing `targetCompanies` (replaced with `targetCompanyIds`). Since Prisma now returns the new fields, the export will naturally include them. No additional changes needed — the spread picks up whatever fields are on the record.

**Step 3: Commit**

```bash
git add app/api/admin/system/export/route.ts
git commit -m "feat: bump export version to 5.0-simplified-roi"
```

---

## Task 7: Update Import Route

**Files:**
- Modify: `app/api/admin/system/import/route.ts`

**Step 1: Update the ROI upsert block**

Find the `// Restore ROI Targets` section (around line 354). Replace the entire upsert `create` and `update` objects with the new field names, adding backwards-compatibility mapping:

```typescript
if (evt.roiTargets) {
    const roi = evt.roiTargets

    // Backwards-compat: map old field names to new
    const targetCustomerMeetings = roi.targetCustomerMeetings ?? roi.targetBoothMeetings ?? null
    const targetTargetedReach = roi.targetTargetedReach ?? roi.targetSocialReach ?? null
    const targetSpeaking = roi.targetSpeaking ?? roi.targetKeynotes ?? null
    const actualTargetedReach = roi.actualTargetedReach ?? roi.actualSocialReach ?? null
    const actualSpeaking = roi.actualSpeaking ?? roi.actualKeynotes ?? null

    // Handle target companies
    let targetCompanyConnect: any = undefined
    if (roi.targetCompanyIds && Array.isArray(roi.targetCompanyIds)) {
        targetCompanyConnect = roi.targetCompanyIds.map((id: string) => ({ id }))
    } else if (roi.targetCompanies && Array.isArray(roi.targetCompanies)) {
        const companyIds: string[] = []
        for (const name of roi.targetCompanies) {
            if (typeof name === 'string') {
                const companyId = await resolveCompany(name)
                companyIds.push(companyId)
            }
        }
        targetCompanyConnect = companyIds.map(id => ({ id }))
    }

    const roiData = {
        expectedPipeline: roi.expectedPipeline,
        winRate: roi.winRate,
        expectedRevenue: roi.expectedRevenue,
        targetCustomerMeetings,
        targetTargetedReach,
        targetSpeaking,
        targetMediaPR: roi.targetMediaPR,
        targetCompanies: targetCompanyConnect ? { connect: targetCompanyConnect } : undefined,
        actualTargetedReach,
        actualSpeaking,
        actualMediaPR: roi.actualMediaPR,
        status: roi.status || 'DRAFT',
        approvedBy: roi.approvedBy,
        approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null,
        submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null,
        rejectedBy: roi.rejectedBy,
        rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null,
    }

    await prisma.eventROITargets.upsert({
        where: { eventId },
        create: { eventId, ...roiData },
        update: {
            ...roiData,
            targetCompanies: targetCompanyConnect ? { set: targetCompanyConnect } : undefined,
        },
    }).catch(e => console.warn('ROI targets import skip', e))
}
```

**Step 2: Commit**

```bash
git add app/api/admin/system/import/route.ts
git commit -m "feat: update ROI import with new fields and backwards-compat mapping"
```

---

## Task 8: Build Verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build completes with no TypeScript or compilation errors. Any type errors indicate missed field name updates — fix them before proceeding.

**Step 2: Start dev server and smoke test**

```bash
npm run dev
```

Manual checks:
1. Navigate to any event's ROI Dashboard
2. Confirm "Targets & Approval" tab shows: Budget ($), Event Targets box (Customer Meetings / Targeted Reach / Speaking / Media/PR), Target Companies
3. As `marketing`/`root`: confirm fields are editable; Save Targets disabled until all fields filled
4. Fill all fields, save — confirm success message
5. Submit for Approval — confirm status changes to SUBMITTED
6. As `root`: confirm Approve and Reject buttons appear
7. Click Reject — confirm status returns to DRAFT with rejection label
8. Re-submit and Approve — confirm tab goes read-only, lock message appears
9. On Event Settings: try to set status to COMMITTED — confirm error message if ROI not approved
10. Navigate to Event Execution tab — confirm 3 fields (Targeted Reach, Speaking, Media/PR)
11. Navigate to Performance Tracker — confirm single Customer Meetings bar, 3 engagement cards

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: ROI simplification complete - consolidated targets, role gates, COMMITTED gate"
```

---

## Files Changed Summary

| File | Type |
|------|------|
| `prisma/schema.prisma` | Schema: remove 13 fields, add 7 |
| `prisma/migrations/<timestamp>_simplify_roi_fields/` | New migration |
| `lib/actions/roi.ts` | Updated types + rejectROI action |
| `app/api/events/[id]/roi/route.ts` | Add reject, tighten auth |
| `app/api/events/[id]/route.ts` | COMMITTED status gate |
| `app/events/[id]/roi/page.tsx` | Full UI restructure |
| `app/api/admin/system/export/route.ts` | Version bump |
| `app/api/admin/system/import/route.ts` | New fields + backwards-compat |
