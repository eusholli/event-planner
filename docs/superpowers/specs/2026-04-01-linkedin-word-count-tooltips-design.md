# LinkedIn Word Count Defaults & Tooltips

**Date:** 2026-04-01  
**Status:** Approved

## Context

The "Draft LinkedIn Article" modal has Min Words / Max Words fields currently defaulting to 2000–2500, which matches article-length content. Users unfamiliar with LinkedIn content best practices have no guidance on what values to use. The defaults should reflect LinkedIn post best practices, and tooltips should give users a quick reference for both content types so they can make an informed choice.

## Change Summary

**File:** `components/roi/LinkedInModal.tsx`

### 1. Default values

Change initial state from article-length to post-length defaults:

```ts
// Before
const [wordCountMin, setWordCountMin] = useState(2000)
const [wordCountMax, setWordCountMax] = useState(2500)

// After
const [wordCountMin, setWordCountMin] = useState(150)
const [wordCountMax, setWordCountMax] = useState(300)
```

LinkedIn post best practices: **150–300 words** (optimal engagement sweet spot ~200 words).

### 2. Tooltips on both labels

Wrap each label text in the existing `Tooltip` component (already used elsewhere in the `roi/` directory). Both fields share the same tooltip content — it acts as a reference guide:

> **Post:** 150–300 words (optimal engagement)  
> **Article:** 1,500–2,000 words (long-form)

### 3. Import

Add to existing imports:

```ts
import Tooltip from '@/components/roi/Tooltip'
```

## Tooltip Component

Existing at `components/roi/Tooltip.tsx` — renders an `Info` icon from `lucide-react` with a hover-reveal dark popover. No new components needed.

## Verification

1. Open the modal — confirm Min Words defaults to 150, Max Words defaults to 300.
2. Hover the Info icon on Min Words label — tooltip appears with post/article best practice ranges.
3. Hover the Info icon on Max Words label — same tooltip appears.
4. Manually change values and submit — generation still works as before.
