# LinkedIn Campaign Edit UX — Design Spec

**Date:** 2026-04-01  
**Status:** Approved

## Context

Two UX gaps exist in the LinkedIn campaign workflow:

1. The campaigns page edit panel has no Cancel button — the only escape is "Hide", which silently preserves unsaved edits in memory.
2. The "Article Ready" modal shows generated article text (humanized and original) as read-only `<pre>` elements. Users cannot edit before saving to campaigns.
3. The database only stores one version of article content (`content`), discarding the original generated text entirely. Both versions have editorial value and should be preserved and independently editable.

## Scope

Changes span the **event-planner** project only (no li-article-agent API changes). Four layers are affected: database schema, API routes, the Article Ready modal, and the campaigns page.

---

## Change 1 — Database Schema

**File:** `prisma/schema.prisma`

Add an optional `originalContent` field to `LinkedInDraft`:

```prisma
originalContent String? @db.Text
```

- `content` (existing) continues to hold the **humanized** version — this is the primary/recommended content shown on the campaigns page.
- `originalContent` (new) holds the **original** generated version.
- Nullable so existing draft records require no migration data backfill.

A Prisma migration must be generated and applied.

---

## Change 2 — API Routes

### POST `/api/social/drafts` (`app/api/social/drafts/route.ts`)

Accept `originalContent` in the request body and pass it to `prisma.linkedInDraft.create`:

```ts
const { eventId, companyIds, companyNames, content, originalContent, angle, tone } = await request.json()
// ...
data: { ..., content, originalContent: originalContent ?? null, ... }
```

### PUT `/api/social/drafts/[id]` (`app/api/social/drafts/[id]/route.ts`)

Add `originalContent` to the conditional update spread:

```ts
...(body.originalContent !== undefined && { originalContent: body.originalContent }),
```

---

## Change 3 — "Article Ready" Modal

**File:** `components/roi/LinkedInModal.tsx`

### Editable state

Add two state variables initialized when `result` arrives (modal transitions to `review` phase):

```ts
const [editedHumanized, setEditedHumanized] = useState('')
const [editedOriginal, setEditedOriginal] = useState('')
```

Seed them when result is set:
```ts
setEditedHumanized(result.article.humanized)
setEditedOriginal(result.article.original)
```

### Textarea replaces pre

In the review phase, replace each `<pre>` element with a `<textarea>`:
- Humanized tab → bound to `editedHumanized` / `setEditedHumanized`
- Original tab → bound to `editedOriginal` / `setEditedOriginal`

Style: match existing `<pre>` container (`rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 max-h-[40vh] overflow-y-auto`), add `resize-y w-full`.

### Save behavior

`handleSave()` always sends **both** versions regardless of active tab:

```ts
body: JSON.stringify({
    eventId,
    companyIds: companies.map(c => c.id),
    companyNames: companies.map(c => c.name),
    content: editedHumanized,         // humanized = primary content
    originalContent: editedOriginal,  // original = preserved separately
    angle: 'Campaign Article',
    tone: `${wordCountMin}–${wordCountMax} words`,
})
```

---

## Change 4 — Campaigns Page Edit Panel

**File:** `app/events/[id]/linkedin-campaigns/page.tsx`

### New state

```ts
// Per-draft active tab: 'humanized' | 'original'
const [editingTab, setEditingTab] = useState<Record<string, 'humanized' | 'original'>>({})
// Per-draft original content edits (humanized edits already tracked in editingContent)
const [editingOriginalContent, setEditingOriginalContent] = useState<Record<string, string>>({})
```

### Cancel handler

```ts
const handleCancel = (id: string) => {
    setExpandedContent(prev => { const next = new Set(prev); next.delete(id); return next })
    setEditingContent(prev => { const next = { ...prev }; delete next[id]; return next })
    setEditingOriginalContent(prev => { const next = { ...prev }; delete next[id]; return next })
    setEditingTab(prev => { const next = { ...prev }; delete next[id]; return next })
}
```

### Save handler update

`saveContent()` sends both versions:

```ts
body: JSON.stringify({
    content: editingContent[id] ?? draft.content,
    originalContent: editingOriginalContent[id] ?? draft.originalContent,
})
```

On success, update both fields in the local `drafts` state.

### Edit panel UI

Replace the single textarea with a tabbed layout matching the modal:

```
[ Humanized (Recommended) ]  [ Original ]
<textarea for active tab>
[ Cancel ]  [ Save Changes ]
```

- "Humanized" tab: textarea bound to `editingContent[id]`, seeded from `draft.content`
- "Original" tab: textarea bound to `editingOriginalContent[id]`, seeded from `draft.originalContent ?? ''`
- Tabs switch independently; both edits persist in state until Save or Cancel
- Cancel button calls `handleCancel(id)`

---

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `originalContent String? @db.Text` to `LinkedInDraft` |
| `app/api/social/drafts/route.ts` | Accept + store `originalContent` in POST |
| `app/api/social/drafts/[id]/route.ts` | Accept + update `originalContent` in PUT |
| `components/roi/LinkedInModal.tsx` | Add editable state, replace `<pre>` with `<textarea>`, save both versions |
| `app/events/[id]/linkedin-campaigns/page.tsx` | Add Cancel button, tabbed edit UI, save both versions |

## Verification

1. **Schema migration:** Run `npx prisma migrate dev` — confirm new field exists in DB.
2. **Modal edit + save:** Generate article → reach review phase → edit both tabs → Save to Campaigns → check campaigns page shows both humanized (primary) and original content in respective tabs.
3. **Campaigns page tabbed edit:** Open edit panel → switch between tabs → edit each → Save Changes → reload page → confirm both versions persisted.
4. **Cancel:** Open edit panel → make edits on both tabs → Cancel → reopen → confirm original saved content is shown (edits discarded).
5. **Existing drafts:** Confirm existing drafts (no `originalContent`) still display correctly; Original tab shows empty/placeholder when no original content exists.
6. **No regression:** Status, metrics, delete flows unaffected.
