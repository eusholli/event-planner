# LinkedIn Article Generator — Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## Overview

Refactor the LinkedIn Content Generator feature on the event ROI Dashboard. Replace the existing WebSocket/OpenClaw-based post generator with a direct HTTP SSE integration against the `li-article-agent` API (`~/dev/li-article-agent`). The feature shifts from generating short per-company LinkedIn posts (~1200 chars) to generating a single long-form LinkedIn article (2000–2500 words) for the full selected-company campaign.

---

## User Flow

1. User selects target companies on the ROI page (up to 5, same selection UX as today)
2. Clicks **"Draft LinkedIn Article"** → modal opens
3. **Phase 1 (params):** Modal shows a loading state ("Preparing article brief…") while a Gemini call runs to generate an article brief. Once returned, the brief appears in an editable textarea. User can also adjust `word_count_min` and `word_count_max` fields. User clicks **Generate Article**.
4. **Phase 2 (generating):** Browser calls `NEXT_PUBLIC_LI_ARTICLE_API_URL/articles/generate` directly via `fetch` SSE. Progress events render in a scrollable log with stage label + message + elapsed time. Heartbeats append a dimmer `waiting… (Xs)` line every ~3 s so the user can confirm the connection is alive. Cancel button available throughout.
5. **Phase 3 (review):** Score banner shows quality %, tier, word count, iterations, and a warning if `target_achieved: false`. Tab bar switches between **Humanized** (default, recommended for publishing) and **Original** (pre-humanization). User selects a version, clicks **Save this version** → saves as a single `LinkedInDraft` record covering all selected companies.
6. Saved draft appears on the existing `/events/[id]/linkedin-campaigns` page.

---

## Architecture

### Brief Generation (new endpoint)

**`POST /api/events/[id]/linkedin-campaigns/generate-brief`**

- Reads `companyNames` from the request body; resolves `eventId` from the path param and fetches `eventName` and `marketingPlan` from the DB (consistent with all other event-scoped endpoints)
- Calls Gemini 2.5 Pro via the Vercel AI SDK with **Google Search grounding enabled**
- Gemini searches for:
  - Latest news on each target company
  - Latest Rakuten Symphony news
- Synthesises a 200–300 word article brief identifying a powerful insight and unique angle for a Rakuten Symphony leadership piece
- Returns `{ brief: string }`

**Prompt shape:**
```
You are a marketing strategist for Rakuten Symphony.

Search for the latest news about [company names] and the latest Rakuten Symphony news.

[If marketing plan exists:]
The event context is: {marketingPlan.slice(0, 1500)}

[If no marketing plan:]
The event is: "{eventName}", targeting companies: {companyNames}.

Based on this research, write a compelling 200–300 word article brief that:
- Identifies a powerful and timely insight connecting Rakuten Symphony's capabilities to these companies' current challenges
- Proposes a unique angle for a LinkedIn thought-leadership article authored by Rakuten Symphony leadership
- Is written as a ready-to-use brief for an article generator (not the article itself)

Return only the brief text. No preamble, no labels.
```

If the endpoint fails, the modal falls back to a minimal static template so the user is never blocked.

### Article Generation (li-article-agent SSE)

Browser calls `NEXT_PUBLIC_LI_ARTICLE_API_URL/articles/generate` directly using the TypeScript SSE client defined in `lib/article-generator-client.ts`. No server-side proxy.

**Request payload:**
```json
{
  "draft": "<user-edited brief>",
  "word_count_min": 2000,
  "word_count_max": 2500
}
```

Other API fields (`target_score`, `max_iterations`, `model`) use API defaults.

**SSE event handling:**
- `progress` → append `[{elapsed}s] [{STAGE}] {message}` to progress log, auto-scroll to bottom
- `heartbeat` → increment counter; every 6 heartbeats append `[{elapsed}s] waiting…` in a dimmer style
- `complete` → transition to review phase
- `error` → show error banner, return to params phase with brief preserved

### Save to Draft

On save, `POST /api/social/drafts` is called unchanged with:
- `companyIds` / `companyNames` — all selected companies
- `content` — the chosen article (humanized or original)
- `angle: "Campaign Article"`
- `tone: "{word_count_min}–{word_count_max} words"`
- `eventId`, `createdBy` — as today

---

## UI — Modal Phases

### Phase 1: Params

```
┌─────────────────────────────────────────────────────┐
│ [LinkedIn icon] Draft LinkedIn Article          [✕] │
├─────────────────────────────────────────────────────┤
│ Target companies:                                   │
│ [Acme Corp] [BT Group] [Orange]                    │
│                                                     │
│ Article Brief  (edit to refine focus)               │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Gemini-generated brief, ~10 rows, editable]   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Word count:  Min [2000]   Max [2500]               │
│                                                     │
├─────────────────────────────────────────────────────┤
│                      [Cancel]  [Generate Article ▶] │
└─────────────────────────────────────────────────────┘
```

Loading state while Gemini brief is being fetched shows a spinner and "Preparing article brief…" in the textarea area. The **Generate Article** button is disabled until the brief has loaded (or the fallback template has been applied).

### Phase 2: Generating

```
┌─────────────────────────────────────────────────────┐
│ [spinner] Generating LinkedIn Article…         [✕] │
├─────────────────────────────────────────────────────┤
│  [  2.1s] [INIT] Pipeline initialised              │
│  [  3.4s] [RAG_SEARCH] Starting web search         │
│  [ 12.7s] [RAG_COMPLETE] Context ready             │
│  [ 13.1s] [GENERATING] Writing article…            │
│  [ 45.1s] waiting…                                 │
│  [ 48.2s] waiting…                                 │
│  [ 91.3s] [SCORING] Evaluating quality…            │
│  [ 94.0s] [SCORED] 87.2% (Strong)                 │
│  [102.1s] [GENERATING] Improving article…          │
│                                      ↓ auto-scroll  │
├─────────────────────────────────────────────────────┤
│                                          [Cancel]   │
└─────────────────────────────────────────────────────┘
```

### Phase 3: Review

```
┌─────────────────────────────────────────────────────┐
│ [LinkedIn icon] Article Ready                  [✕] │
├─────────────────────────────────────────────────────┤
│ 91.3% · World-class · 2,187 words · 3 iterations   │
│ ✓ Target achieved                                   │
│                                                     │
│ [Humanized ●] [Original]                           │
│ ┌─────────────────────────────────────────────────┐ │
│ │                                                 │ │
│ │  <article text — scrollable ~60vh>              │ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ [Copy]          [Close]  [Save Humanized version ▶] │
└─────────────────────────────────────────────────────┘
```

If `target_achieved: false`, the score banner is amber with a note "Target score not reached — best version returned".

---

## Files

### New
| File | Purpose |
|---|---|
| `lib/article-generator-client.ts` | SSE client + TypeScript types from API.md |
| `app/api/events/[id]/linkedin-campaigns/generate-brief/route.ts` | Gemini + search grounding → brief string |

### Modified
| File | Change |
|---|---|
| `components/roi/LinkedInModal.tsx` | Complete rewrite — remove WebSocket/OpenClaw, implement 3-phase SSE UI; add `eventName` prop |
| `app/events/[id]/roi/page.tsx` | Button label "Draft LinkedIn Posts" → "Draft LinkedIn Article"; remove `angle`/`tone` state; pass `eventName` prop to modal |
| `CLAUDE.md` | Document `NEXT_PUBLIC_LI_ARTICLE_API_URL` in env vars section |

### Unchanged
| File | Reason |
|---|---|
| `app/api/social/drafts/route.ts` | Save endpoint unchanged |
| `app/api/social/drafts/[id]/route.ts` | Update/delete unchanged |
| `app/events/[id]/linkedin-campaigns/page.tsx` | Draft list page unchanged |
| `prisma/schema.prisma` | `LinkedInDraft` model unchanged |
| `ws-proxy/index.js` | No LinkedIn-specific code — only a generic comment |
| `~/.openclaw/agents/` | No LinkedIn-specific agents exist |

---

## Environment Variables

```bash
NEXT_PUBLIC_LI_ARTICLE_API_URL=http://localhost:8000
# URL of the li-article-agent API server.
# Default: http://localhost:8000 when unset.
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Gemini brief generation fails | Fallback to static template; warning shown in textarea |
| No marketing plan exists | Gemini uses event name + company names; warning banner in modal |
| li-article-agent unreachable | Error banner on generate click; user stays on params phase with brief intact |
| SSE `error` event | Error banner shown; user returned to params phase |
| `target_achieved: false` | Article still returned; amber warning in score banner |
| User cancels during generation | `AbortController.abort()` called; modal returns to params phase |

---

## RBAC

Unchanged — `canManageEvents()` (root + marketing roles) required for both the generate-brief endpoint and the drafts API.
