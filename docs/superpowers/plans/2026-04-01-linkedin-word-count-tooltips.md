# LinkedIn Word Count Defaults & Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the "Draft LinkedIn Article" modal so Min/Max Words default to LinkedIn post best-practice values (150–300) and both labels show a tooltip with best-practice ranges for posts and articles.

**Architecture:** Single-file change in `LinkedInModal.tsx` — update two `useState` defaults, import the existing `Tooltip` component, and wrap both word-count labels with it.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, lucide-react, existing `Tooltip` component at `components/roi/Tooltip.tsx`.

---

### Task 1: Update defaults and add tooltips

**Files:**
- Modify: `components/roi/LinkedInModal.tsx:3-5` (imports)
- Modify: `components/roi/LinkedInModal.tsx:47-48` (state defaults)
- Modify: `components/roi/LinkedInModal.tsx:305-327` (word count UI)

- [ ] **Step 1: Add Tooltip import**

In `components/roi/LinkedInModal.tsx`, add to the existing imports (after line 5):

```tsx
import Tooltip from '@/components/roi/Tooltip'
```

The full import block should look like:

```tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { X, Linkedin } from 'lucide-react'
import { generateArticle } from '@/lib/article-generator-client'
import type { CompleteEvent } from '@/lib/article-generator-client'
import { useAuth } from '@/components/auth'
import Tooltip from '@/components/roi/Tooltip'
```

- [ ] **Step 2: Change default word count values**

On lines 47–48, change the state initialization:

```tsx
// Before
const [wordCountMin, setWordCountMin] = useState(2000)
const [wordCountMax, setWordCountMax] = useState(2500)

// After
const [wordCountMin, setWordCountMin] = useState(150)
const [wordCountMax, setWordCountMax] = useState(300)
```

- [ ] **Step 3: Add tooltips to the word count labels**

Replace the word count section (lines 305–327) with:

```tsx
{/* Word count */}
<div className="flex items-center gap-4">
    <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">
            <Tooltip content={
                <span>
                    <strong>Post:</strong> 150–300 words (optimal engagement)<br />
                    <strong>Article:</strong> 1,500–2,000 words (long-form)
                </span>
            }>
                Min Words
            </Tooltip>
        </label>
        <input
            type="number"
            min={100}
            value={wordCountMin}
            onChange={e => setWordCountMin(Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
    </div>
    <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">
            <Tooltip content={
                <span>
                    <strong>Post:</strong> 150–300 words (optimal engagement)<br />
                    <strong>Article:</strong> 1,500–2,000 words (long-form)
                </span>
            }>
                Max Words
            </Tooltip>
        </label>
        <input
            type="number"
            min={100}
            value={wordCountMax}
            onChange={e => setWordCountMax(Number(e.target.value))}
            className="w-24 px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
    </div>
</div>
```

- [ ] **Step 4: Verify the app builds without errors**

```bash
cd /Users/eusholli/dev/event-planner
npm run build 2>&1 | tail -20
```

Expected: build completes with no TypeScript errors referencing `LinkedInModal.tsx`.

- [ ] **Step 5: Manual verification**

Open the modal in the browser:
1. Min Words field shows `150`, Max Words shows `300`
2. Hover the ⓘ icon next to "Min Words" → tooltip appears showing Post and Article ranges
3. Hover the ⓘ icon next to "Max Words" → same tooltip appears
4. Change values and submit a generation — confirm it still works end-to-end

- [ ] **Step 6: Commit**

```bash
cd /Users/eusholli/dev/event-planner
git add components/roi/LinkedInModal.tsx
git commit -m "feat: set LinkedIn post word count defaults and add best-practice tooltips"
```
