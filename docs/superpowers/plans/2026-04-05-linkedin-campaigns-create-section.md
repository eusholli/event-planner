# LinkedIn Campaigns — Create Campaign Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Create Campaign" section at the top of the LinkedIn Campaigns page so users can initiate campaigns directly without visiting the ROI page.

**Architecture:** Two files are modified. `LinkedInModal` gets two new optional props (`initialPhase`, `initialBrief`) so it can open at the `params` phase with a blank prompt when no companies are selected. The LinkedIn Campaigns page gains a ROI fetch, company selection state, and a Create Campaign card rendered above the existing drafts list.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Lucide React

---

## File Map

| File | Change |
|------|--------|
| `components/roi/LinkedInModal.tsx` | Add `initialPhase` and `initialBrief` props; handle no-companies reset |
| `app/events/[id]/linkedin-campaigns/page.tsx` | Add ROI fetch, company selection state, Create Campaign section |

---

## Task 1: Update `LinkedInModal` to support `initialPhase` and `initialBrief`

**Files:**
- Modify: `components/roi/LinkedInModal.tsx`

### Step 1.1 — Update the props interface and function signature

In `components/roi/LinkedInModal.tsx`, replace lines 16–42 (the interface and function signature) with:

```typescript
interface LinkedInModalProps {
    isOpen: boolean
    onClose: () => void
    companies: Company[]
    eventId: string
    eventSlug: string
    initialPhase?: Phase
    initialBrief?: string
}

export default function LinkedInModal({
    isOpen,
    onClose,
    companies,
    eventId,
    eventSlug,
    initialPhase = 'brief-loading',
    initialBrief = '',
}: LinkedInModalProps) {
```

### Step 1.2 — Initialize `phase` state from `initialPhase`

Replace line 44:
```typescript
// Before:
const [phase, setPhase] = useState<Phase>('brief-loading')

// After:
const [phase, setPhase] = useState<Phase>(initialPhase)
```

### Step 1.3 — Update the brief-fetch `useEffect` to handle the no-companies case

Replace the entire `useEffect` block (lines 66–109) with:

```typescript
// Fetch brief when modal opens
useEffect(() => {
    if (!isOpen) return

    // Reset shared state regardless of companies
    setLogEntries([])
    setResult(null)
    setSavedId(null)
    setGenError(null)
    setEditedHumanized('')
    setEditedOriginal('')
    heartbeatCountRef.current = 0

    if (companies.length === 0) {
        // No companies: skip brief fetch, open at initialPhase with initialBrief
        setPhase(initialPhase)
        setBrief(initialBrief)
        setBriefWarning(false)
        setBriefError(false)
        return
    }

    setPhase('brief-loading')
    setBrief('')
    setBriefWarning(false)
    setBriefError(false)

    const ac = new AbortController()

    fetch(`/api/events/${eventId}/linkedin-campaigns/generate-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyNames: companies.map(c => c.name) }),
        signal: ac.signal,
    })
        .then(res => res.json())
        .then(data => {
            if (data.brief) {
                setBrief(data.brief)
                if (!data.hadMarketingPlan) setBriefWarning(true)
            } else {
                setBrief(FALLBACK_BRIEF(companies.map(c => c.name)))
                setBriefError(true)
            }
            setPhase('params')
        })
        .catch(err => {
            if (err.name === 'AbortError') return
            setBrief(FALLBACK_BRIEF(companies.map(c => c.name)))
            setBriefError(true)
            setPhase('params')
        })

    return () => ac.abort()
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen, eventId, companyKey, initialPhase, initialBrief])
```

### Step 1.4 — Hide "Target companies" badge list when companies is empty

In the `params` phase JSX (around line 264), wrap the Target companies `<div>` so it only renders when there are companies:

```tsx
{/* Company badges — only shown when companies were selected */}
{companies.length > 0 && (
    <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Target companies</p>
        <div className="flex flex-wrap gap-2">
            {companies.map(c => (
                <span key={c.id} className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-800 rounded-lg text-sm font-medium border border-blue-200">
                    {c.name}
                </span>
            ))}
        </div>
    </div>
)}
```

### Step 1.5 — Commit

```bash
git add components/roi/LinkedInModal.tsx
git commit -m "feat: add initialPhase and initialBrief props to LinkedInModal"
```

---

## Task 2: Add Create Campaign section to LinkedIn Campaigns page

**Files:**
- Modify: `app/events/[id]/linkedin-campaigns/page.tsx`

### Step 2.1 — Add imports

Replace the import line at the top of the file:

```typescript
// Before:
import { Linkedin, Trash2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

// After:
import { Linkedin, Trash2, ChevronDown, ChevronUp, ExternalLink, Check } from 'lucide-react'
```

Add the LinkedInModal import after the existing imports (after the last `import` line):

```typescript
import LinkedInModal from '@/components/roi/LinkedInModal'
```

### Step 2.2 — Add the `Company` type

Add this type definition after the `STATUS_COLORS` constant (after line 33):

```typescript
interface Company {
    id: string
    name: string
    pipelineValue?: number | null
}
```

### Step 2.3 — Add new state variables

Inside `LinkedInCampaignsPage`, after the existing `useState` declarations (after line 62), add:

```typescript
const [targetCompanies, setTargetCompanies] = useState<Company[]>([])
const [selectedForLinkedIn, setSelectedForLinkedIn] = useState<Set<string>>(new Set())
const [linkedInModalOpen, setLinkedInModalOpen] = useState(false)
```

### Step 2.4 — Add the ROI fetch alongside the existing drafts fetch

Replace the existing `useEffect` (lines 64–73) with:

```typescript
useEffect(() => {
    if (!eventId) return

    fetch(`/api/social/drafts?eventId=${eventId}`)
        .then(res => res.json())
        .then(data => {
            setDrafts(Array.isArray(data) ? data : [])
            setLoading(false)
        })
        .catch(() => setLoading(false))

    fetch(`/api/events/${eventId}/roi`)
        .then(res => res.json())
        .then(data => {
            if (data.targets?.targetCompanies) {
                setTargetCompanies(data.targets.targetCompanies)
            }
        })
        .catch(() => {/* non-critical — section renders empty */})
}, [eventId])
```

### Step 2.5 — Remove the early loading return and move spinner into the drafts area

Remove the early return block (lines 226–235):

```typescript
// DELETE this entire block:
if (loading) {
    return (
        <div className="flex items-center justify-center py-24">
            <svg className="w-6 h-6 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
        </div>
    )
}
```

Then replace the drafts section of the return JSX. The section that currently starts `{drafts.length === 0 ? (` (line 250) should become:

```tsx
{loading ? (
    <div className="flex items-center justify-center py-24">
        <svg className="w-6 h-6 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    </div>
) : drafts.length === 0 ? (
    <div className="rounded-2xl border border-zinc-200/60 bg-white/70 p-12 text-center">
        <Linkedin className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
        <p className="text-zinc-500">No LinkedIn drafts yet.</p>
        <p className="text-sm text-zinc-400 mt-1">
            Use the &quot;Draft LinkedIn Article&quot; button above to create your first campaign.
        </p>
    </div>
) : (
    <div className="space-y-4">
        {drafts.map(draft => (
            // ... existing draft card JSX unchanged ...
        ))}
    </div>
)}
```

> **Note:** Keep the existing `drafts.map(draft => ...)` JSX block exactly as-is inside the new ternary's last branch. Only the outer ternary structure changes.

### Step 2.6 — Add the Create Campaign section

Insert the following JSX block in the main return, between the header `<div>` (the one with `<Linkedin>` icon and `<h2>`) and the `{message && ...}` block:

```tsx
{/* Create Campaign */}
<div className="rounded-2xl border border-zinc-200/60 bg-white/70 backdrop-blur-sm shadow-sm p-6">
    <h3 className="text-base font-semibold text-zinc-900 mb-4">Create Campaign</h3>

    {targetCompanies.length > 0 ? (
        <div className="space-y-3">
            <p className="text-xs text-zinc-500">
                Select up to 5 target companies for your campaign (optional)
            </p>
            <div className="flex flex-wrap gap-2">
                {targetCompanies.map(company => {
                    const selected = selectedForLinkedIn.has(company.id)
                    const atMax = selectedForLinkedIn.size >= 5
                    return (
                        <button
                            key={company.id}
                            onClick={() => {
                                setSelectedForLinkedIn(prev => {
                                    const next = new Set(prev)
                                    if (next.has(company.id)) next.delete(company.id)
                                    else if (next.size < 5) next.add(company.id)
                                    return next
                                })
                            }}
                            disabled={!selected && atMax}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                                selected
                                    ? 'bg-blue-50 text-blue-800 border-blue-300'
                                    : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            {selected && <Check className="w-3.5 h-3.5" />}
                            {company.name}
                        </button>
                    )
                })}
            </div>
            {selectedForLinkedIn.size >= 5 && (
                <p className="text-xs text-amber-600">Maximum 5 companies selected.</p>
            )}
            {selectedForLinkedIn.size > 0 && (
                <button
                    onClick={() => setSelectedForLinkedIn(new Set())}
                    className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                    Clear selection
                </button>
            )}
        </div>
    ) : (
        <p className="text-sm text-zinc-400 mb-4">
            Add target companies on the ROI page to pre-fill your campaign.
        </p>
    )}

    <div className="mt-4">
        <button
            onClick={() => setLinkedInModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
            <Linkedin className="w-4 h-4" />
            {selectedForLinkedIn.size > 0
                ? `Draft LinkedIn Article (${selectedForLinkedIn.size} ${selectedForLinkedIn.size === 1 ? 'company' : 'companies'})`
                : 'Draft LinkedIn Article'
            }
        </button>
    </div>
</div>
```

### Step 2.7 — Add the `LinkedInModal` to the return JSX

At the very end of the `return (...)`, just before the closing `</div>`, add:

```tsx
<LinkedInModal
    isOpen={linkedInModalOpen}
    onClose={() => {
        setLinkedInModalOpen(false)
        setSelectedForLinkedIn(new Set())
        // Refresh drafts list in case a new draft was saved
        fetch(`/api/social/drafts?eventId=${eventId}`)
            .then(res => res.json())
            .then(data => setDrafts(Array.isArray(data) ? data : []))
            .catch(() => {})
    }}
    companies={targetCompanies.filter(c => selectedForLinkedIn.has(c.id))}
    eventId={eventId}
    eventSlug={eventId}
    initialPhase={selectedForLinkedIn.size === 0 ? 'params' : 'brief-loading'}
    initialBrief={selectedForLinkedIn.size === 0 ? '' : undefined}
/>
```

### Step 2.8 — Verify the build compiles

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors. Fix any type errors before continuing.

### Step 2.9 — Manual verification

Start the dev server (`npm run dev`) and navigate to any event's LinkedIn Campaigns page (`/events/<id>/linkedin-campaigns`).

**Check 1 — Section renders:** "Create Campaign" card appears above the drafts list (or spinner).

**Check 2 — With ROI target companies:**
- Company badges appear as clickable pills.
- Clicking a badge toggles selection: blue highlight + checkmark appears.
- Clicking again deselects.
- Selecting a 6th company is blocked (disabled state + amber warning "Maximum 5 companies selected.").
- "Clear selection" link appears when any company is selected and clears all on click.
- Button label updates: "Draft LinkedIn Article (2 companies)" when 2 are selected.

**Check 3 — With companies selected → modal opens at brief-loading:**
- Click "Draft LinkedIn Article (N companies)".
- Modal opens showing spinner + "Researching companies and generating article brief…".
- After loading, transitions to params phase with AI-generated brief and company badges shown.
- Proceeding through generate → review → "Save to Campaigns" adds a new draft to the list.
- Closing the modal clears the selection.

**Check 4 — With no companies selected → modal opens at params:**
- Click "Draft LinkedIn Article" with nothing selected.
- Modal opens directly at the params phase (no spinner/loading phase).
- "Target companies" badge list is NOT shown (companies array is empty).
- Brief text area is empty — user can type freely.
- Proceeding through generate → review → save works correctly.

**Check 5 — No ROI target companies:**
- On an event with no target companies set, the fallback note "Add target companies on the ROI page to pre-fill your campaign." is shown.
- "Draft LinkedIn Article" button still works and opens modal at params phase with blank brief.

**Check 6 — ROI page unaffected:**
- Navigate to `/events/<id>/roi`.
- Company selection and "Draft LinkedIn Article" button behave exactly as before.

### Step 2.10 — Commit

```bash
git add app/events/[id]/linkedin-campaigns/page.tsx
git commit -m "feat: add Create Campaign section to LinkedIn Campaigns page"
```

---

## Verification Summary

| Scenario | Expected result |
|----------|----------------|
| Companies selected → button clicked | Modal opens at `brief-loading`, fetches AI brief |
| No companies selected → button clicked | Modal opens at `params` with blank brief |
| 6th company click | Disabled; amber warning shown |
| Modal saved → close | New draft appears in list; selection cleared |
| ROI page | Unchanged behavior |
| Event with no target companies | Fallback note shown; button still works |
