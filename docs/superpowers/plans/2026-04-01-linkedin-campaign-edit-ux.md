# LinkedIn Campaign Edit UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist both humanized and original article versions in `LinkedInDraft`, add tabbed editing to the "Article Ready" modal and campaigns page, and add a Cancel button to the campaign edit panel.

**Architecture:** Schema-first — add nullable `originalContent` to `LinkedInDraft`, thread it through POST/PUT API routes, update the modal to save both versions, then replace the campaigns page single-textarea editor with a tabbed two-version editor with Cancel.

**Tech Stack:** Next.js 14 (App Router), Prisma ORM, PostgreSQL, React hooks, TypeScript, Tailwind CSS, Playwright (API tests)

---

## File Map

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `originalContent String? @db.Text` to `LinkedInDraft` |
| `app/api/social/drafts/route.ts` | Accept + persist `originalContent` in POST handler |
| `app/api/social/drafts/[id]/route.ts` | Accept + update `originalContent` in PUT handler |
| `tests/api/social-drafts.spec.ts` | New Playwright API tests covering both fields |
| `components/roi/LinkedInModal.tsx` | Editable state, textarea, save both versions |
| `app/events/[id]/linkedin-campaigns/page.tsx` | Cancel button, tabbed edit UI, save both versions |

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add field to schema**

In `prisma/schema.prisma`, find the `LinkedInDraft` model (around line 202). After the `content` line, add:

```prisma
model LinkedInDraft {
  id              String    @id @default(cuid())
  eventId         String
  companyIds      String[]
  companyNames    String[]
  content         String    @db.Text
  originalContent String?   @db.Text
  angle           String
  tone            String
  // ... rest of fields unchanged
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd /Users/eusholli/dev/event-planner
npx prisma migrate dev --name add-original-content-to-linkedin-draft
```

Expected output: `✔  Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected output: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add originalContent field to LinkedInDraft"
```

---

## Task 2: API POST Route — Accept originalContent

**Files:**
- Modify: `app/api/social/drafts/route.ts`

- [ ] **Step 1: Update destructuring and create call**

In `app/api/social/drafts/route.ts`, update the POST handler. Replace the destructuring line and `prisma.linkedInDraft.create` call:

```typescript
// Replace this line:
const { eventId: rawEventId, companyIds, companyNames, content, angle, tone } = await request.json()

// With this:
const { eventId: rawEventId, companyIds, companyNames, content, originalContent, angle, tone } = await request.json()
```

```typescript
// Replace the validation check:
if (!rawEventId || !content || !angle || !tone) {
    return NextResponse.json({ error: 'eventId, content, angle, and tone are required' }, { status: 400 })
}
```

(Validation unchanged — `originalContent` is optional)

```typescript
// Replace the create call:
const draft = await prisma.linkedInDraft.create({
    data: {
        eventId: event.id,
        companyIds: companyIds ?? [],
        companyNames: companyNames ?? [],
        content,
        originalContent: originalContent ?? null,
        angle,
        tone,
        createdBy: userId,
    },
})
```

- [ ] **Step 2: Commit**

```bash
git add app/api/social/drafts/route.ts
git commit -m "feat: accept originalContent in POST /api/social/drafts"
```

---

## Task 3: API PUT Route — Accept originalContent

**Files:**
- Modify: `app/api/social/drafts/[id]/route.ts`

- [ ] **Step 1: Add originalContent to update spread**

In `app/api/social/drafts/[id]/route.ts`, in the PUT handler, find the `data:` object passed to `prisma.linkedInDraft.update`. Add one line after the existing `content` conditional:

```typescript
const updated = await prisma.linkedInDraft.update({
    where: { id },
    data: {
        ...(body.content !== undefined && { content: body.content }),
        ...(body.originalContent !== undefined && { originalContent: body.originalContent }),
        ...(body.status !== undefined && { status: body.status }),
        // ... rest of fields unchanged
    },
})
```

- [ ] **Step 2: Commit**

```bash
git add app/api/social/drafts/[id]/route.ts
git commit -m "feat: accept originalContent in PUT /api/social/drafts/[id]"
```

---

## Task 4: API Tests — originalContent Round-Trip

**Files:**
- Create: `tests/api/social-drafts.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/social-drafts.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { createTestEvent, deleteTestEvent } from './helpers'

test.describe('Social Drafts API — originalContent', () => {
    let eventId: string
    let draftId: string

    test.beforeAll(async ({ request }) => {
        const ts = Date.now()
        const res = await request.post('/api/events', {
            data: {
                name: `Drafts Test Event ${ts}`,
                url: `https://test-drafts-${ts}.com`,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 86400000).toISOString(),
                region: 'EU_UK',
                status: 'PIPELINE',
            }
        })
        const body = await res.json()
        eventId = body.id
    })

    test.afterAll(async ({ request }) => {
        if (draftId) await request.delete(`/api/social/drafts/${draftId}`)
        if (eventId) await deleteTestEvent(request, eventId)
    })

    test('POST saves both content and originalContent', async ({ request }) => {
        const res = await request.post('/api/social/drafts', {
            data: {
                eventId,
                content: 'Humanized article text',
                originalContent: 'Original article text',
                angle: 'Campaign Article',
                tone: '2000–2500 words',
                companyIds: [],
                companyNames: [],
            }
        })
        expect(res.status()).toBe(201)
        const body = await res.json()
        expect(body.content).toBe('Humanized article text')
        expect(body.originalContent).toBe('Original article text')
        draftId = body.id
    })

    test('POST without originalContent stores null', async ({ request }) => {
        const ts = Date.now()
        const res = await request.post('/api/social/drafts', {
            data: {
                eventId,
                content: 'Humanized only',
                angle: 'Campaign Article',
                tone: '2000–2500 words',
                companyIds: [],
                companyNames: [],
            }
        })
        expect(res.status()).toBe(201)
        const body = await res.json()
        expect(body.originalContent).toBeNull()
        // cleanup
        await request.delete(`/api/social/drafts/${body.id}`)
    })

    test('PUT updates originalContent independently', async ({ request }) => {
        const res = await request.put(`/api/social/drafts/${draftId}`, {
            data: { originalContent: 'Updated original text' }
        })
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body.originalContent).toBe('Updated original text')
        expect(body.content).toBe('Humanized article text') // unchanged
    })

    test('GET returns originalContent in draft list', async ({ request }) => {
        const res = await request.get(`/api/social/drafts?eventId=${eventId}`)
        expect(res.status()).toBe(200)
        const drafts = await res.json()
        const draft = drafts.find((d: { id: string }) => d.id === draftId)
        expect(draft).toBeDefined()
        expect(draft.originalContent).toBe('Updated original text')
    })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/eusholli/dev/event-planner
npx playwright test tests/api/social-drafts.spec.ts --reporter=line
```

Expected: all 4 tests pass. If auth errors occur, ensure the dev server is running with `npm run dev` and Playwright is configured to use an authenticated session (check `playwright.config.ts` for baseURL and auth setup).

- [ ] **Step 3: Commit**

```bash
git add tests/api/social-drafts.spec.ts
git commit -m "test: add API tests for originalContent in social drafts"
```

---

## Task 5: Article Ready Modal — Editable Text

**Files:**
- Modify: `components/roi/LinkedInModal.tsx`

- [ ] **Step 1: Add editable state variables**

In `components/roi/LinkedInModal.tsx`, find the existing `useState` declarations near the top of the component. Add two new state variables after the existing `activeTab` state:

```typescript
const [editedHumanized, setEditedHumanized] = useState('')
const [editedOriginal, setEditedOriginal] = useState('')
```

- [ ] **Step 2: Seed state when result arrives**

Find the `useEffect` or the location where `result` is set (where `setResult(...)` is called after generation completes). Add a `useEffect` to seed the editable state:

```typescript
useEffect(() => {
    if (result) {
        setEditedHumanized(result.article.humanized)
        setEditedOriginal(result.article.original)
    }
}, [result])
```

Place this after the existing state declarations, before any return statement.

- [ ] **Step 3: Replace read-only pre with editable textarea**

In the review phase section (around line 376), find this block:

```tsx
<div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 max-h-[40vh] overflow-y-auto">
    <pre className="text-sm text-zinc-800 whitespace-pre-wrap font-sans leading-relaxed">
        {activeTab === 'humanized' ? result.article.humanized : result.article.original}
    </pre>
</div>
```

Replace with:

```tsx
<div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 max-h-[40vh] overflow-y-auto">
    <textarea
        className="w-full text-sm text-zinc-800 font-sans leading-relaxed resize-y bg-transparent focus:outline-none min-h-[200px]"
        value={activeTab === 'humanized' ? editedHumanized : editedOriginal}
        onChange={e =>
            activeTab === 'humanized'
                ? setEditedHumanized(e.target.value)
                : setEditedOriginal(e.target.value)
        }
    />
</div>
```

- [ ] **Step 4: Update handleSave to send both versions**

Find `handleSave` (around line 169). Replace the `content` derivation and the POST body:

```typescript
const handleSave = useCallback(async () => {
    if (!result) return
    setSaving(true)
    try {
        const res = await fetch('/api/social/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eventId,
                companyIds: companies.map(c => c.id),
                companyNames: companies.map(c => c.name),
                content: editedHumanized,
                originalContent: editedOriginal,
                angle: 'Campaign Article',
                tone: `${wordCountMin}–${wordCountMax} words`,
            }),
        })
        if (res.ok) {
            const saved = await res.json()
            setSavedId(saved.id)
        } else {
            const err = await res.json().catch(() => ({}))
            setGenError(err.error ?? 'Failed to save draft')
        }
    } finally {
        setSaving(false)
    }
}, [editedHumanized, editedOriginal, eventId, companies, wordCountMin, wordCountMax])
```

- [ ] **Step 5: Manual verification**

Start dev server (`npm run dev`), navigate to an event's ROI page, generate an article, reach the "Article Ready" phase. Verify:
- Text is editable in both Humanized and Original tabs
- Switching tabs preserves edits on each tab
- Clicking "Save to Campaigns" creates a draft — check the campaigns page shows both versions

- [ ] **Step 6: Commit**

```bash
git add components/roi/LinkedInModal.tsx
git commit -m "feat: make Article Ready modal text editable, save both versions"
```

---

## Task 6: Campaigns Page — Tabbed Edit UI + Cancel

**Files:**
- Modify: `app/events/[id]/linkedin-campaigns/page.tsx`

- [ ] **Step 1: Add new state variables**

Find the existing `useState` declarations in the component. Add after the existing `editingContent` state:

```typescript
const [editingTab, setEditingTab] = useState<Record<string, 'humanized' | 'original'>>({})
const [editingOriginalContent, setEditingOriginalContent] = useState<Record<string, string>>({})
```

- [ ] **Step 2: Add handleCancel function**

Add a `handleCancel` function alongside the existing `saveContent` and `saveMetrics` functions:

```typescript
const handleCancel = (id: string) => {
    setExpandedContent(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
    })
    setEditingContent(prev => {
        const next = { ...prev }
        delete next[id]
        return next
    })
    setEditingOriginalContent(prev => {
        const next = { ...prev }
        delete next[id]
        return next
    })
    setEditingTab(prev => {
        const next = { ...prev }
        delete next[id]
        return next
    })
}
```

- [ ] **Step 3: Update saveContent to send both versions**

Replace the existing `saveContent` function (lines 110–128) with:

```typescript
const saveContent = async (id: string) => {
    setSaving(id)
    const draft = drafts.find(d => d.id === id)
    try {
        const res = await fetch(`/api/social/drafts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: editingContent[id] ?? draft?.content,
                originalContent: editingOriginalContent[id] ?? draft?.originalContent ?? null,
            }),
        })
        if (res.ok) {
            const updated = await res.json()
            setDrafts(prev => prev.map(d =>
                d.id === id
                    ? { ...d, content: updated.content, originalContent: updated.originalContent }
                    : d
            ))
            setExpandedContent(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
            setMessage('Draft updated.')
            setTimeout(() => setMessage(''), 3000)
        }
    } finally {
        setSaving(null)
    }
}
```

- [ ] **Step 4: Replace edit panel with tabbed UI**

Find the edit panel block (around lines 272–299):

```tsx
{expandedContent.has(draft.id) && (
    <div className="px-6 pb-4 border-t border-zinc-100 pt-4 space-y-3">
        <textarea
            value={editingContent[draft.id] ?? draft.content}
            onChange={e => setEditingContent(prev => ({ ...prev, [draft.id]: e.target.value }))}
            rows={10}
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <div className="flex justify-end gap-3">
            <button onClick={() => navigator.clipboard.writeText(editingContent[draft.id] ?? draft.content)}>
                Copy
            </button>
            <button onClick={() => saveContent(draft.id)}>
                {saving === draft.id ? 'Saving…' : 'Save Changes'}
            </button>
        </div>
    </div>
)}
```

Replace with:

```tsx
{expandedContent.has(draft.id) && (
    <div className="px-6 pb-4 border-t border-zinc-100 pt-4 space-y-3">
        {/* Tab bar */}
        <div className="flex gap-1">
            <button
                onClick={() => setEditingTab(prev => ({ ...prev, [draft.id]: 'humanized' }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    (editingTab[draft.id] ?? 'humanized') === 'humanized'
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
                }`}
            >
                Humanized <span className="text-emerald-600 ml-1">Recommended</span>
            </button>
            <button
                onClick={() => setEditingTab(prev => ({ ...prev, [draft.id]: 'original' }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    (editingTab[draft.id] ?? 'humanized') === 'original'
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
                }`}
            >
                Original
            </button>
        </div>

        {/* Textarea for active tab */}
        {(editingTab[draft.id] ?? 'humanized') === 'humanized' ? (
            <textarea
                value={editingContent[draft.id] ?? draft.content}
                onChange={e => setEditingContent(prev => ({ ...prev, [draft.id]: e.target.value }))}
                rows={10}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
        ) : (
            <textarea
                value={editingOriginalContent[draft.id] ?? (draft.originalContent ?? '')}
                onChange={e => setEditingOriginalContent(prev => ({ ...prev, [draft.id]: e.target.value }))}
                rows={10}
                placeholder="No original version stored for this draft."
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
            <button
                onClick={() => {
                    const activeTab = editingTab[draft.id] ?? 'humanized'
                    const text = activeTab === 'humanized'
                        ? (editingContent[draft.id] ?? draft.content)
                        : (editingOriginalContent[draft.id] ?? (draft.originalContent ?? ''))
                    navigator.clipboard.writeText(text)
                }}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            >
                Copy
            </button>
            <button
                onClick={() => handleCancel(draft.id)}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={() => saveContent(draft.id)}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={saving === draft.id}
            >
                {saving === draft.id ? 'Saving…' : 'Save Changes'}
            </button>
        </div>
    </div>
)}
```

- [ ] **Step 5: Manual verification**

Navigate to `/<event>/linkedin-campaigns`. For a draft saved from the modal (with both versions):
1. Open edit panel — confirm Humanized tab is shown by default with content
2. Switch to Original tab — confirm original text is shown
3. Edit both tabs, switch between — confirm edits persist per tab
4. Click Cancel — panel closes, reopening shows original saved content
5. Edit one tab, Save Changes — confirm both versions persisted (check DB or reload)

For an older draft (no `originalContent`):
6. Open edit panel — Original tab shows placeholder text, no crash

- [ ] **Step 6: Commit**

```bash
git add app/events/[id]/linkedin-campaigns/page.tsx
git commit -m "feat: add tabbed edit UI and Cancel button to campaigns page"
```

---

## Verification Checklist

- [ ] `npx prisma migrate dev` applied cleanly, no errors
- [ ] All 4 Playwright API tests in `social-drafts.spec.ts` pass
- [ ] Modal: both tabs editable, both versions saved to DB on "Save to Campaigns"
- [ ] Campaigns page: tabbed editor works, Cancel discards all edits, Save persists both
- [ ] Older drafts (no `originalContent`) show placeholder in Original tab, no crash
- [ ] Copy button copies text from the active tab
- [ ] Metrics and status save flows unaffected
