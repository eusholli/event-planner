# Design: Fix Event Sparkle → ROI Intelligence Flow

**Date:** 2026-03-16
**Branch:** multi-event
**Status:** Approved

---

## Problem

Two bugs in the event sparkle → OpenClaw intelligence → ROI update flow:

1. **Marketing plan excluded from "update all"**: `AGENTS.md` instructed Kenji to save `marketingPlan` as a separate second `[PENDING_ACTION]` after the ROI targets action. Users who said "update all" had to confirm two actions, and the marketing plan was often skipped or forgotten.

2. **Agent overwrites existing values without checking**: Kenji has no ability to call read APIs directly (AGENTS.md: "For read operations, you do NOT have a tool to call the API directly"). The sparkle prompt did not include current ROI values, so Kenji blindly wrote all fields — even ones already set — without confirming with the user.

---

## Approach: Pre-fetch in Sparkle Prompt (Approach A)

Make the sparkle button `onClick` async. Before navigating to `/intelligence`, fetch the current ROI targets from `/api/events/${event.id}/roi` (using the UUID, not slug) and inject them as a "Current ROI values:" block into the prompt. Update AGENTS.md behavior rules to actively use this block.

No ws-proxy changes. No new API endpoints. Three files change.

---

## Change 1: `app/events/page.tsx`

**Location:** The sparkle button's `onClick` handler on each event card.

### What changes

- Make the handler `async`.
- Add a loading state to the sparkle button (`sparkleLoadingId` in component state, set to `event.id` during fetch, cleared after). During loading, the icon becomes a spinner or the button is visually disabled.
- Call `fetch(\`/api/events/${event.id}/roi\`)` using `event.id` (UUID — always present, never undefined; slug can be undefined for newly created events). Parse the response.
- Build a `currentROIValues` string block listing every ROI field with its current value or `null`:
  - Numeric/string fields listed as `fieldName: <value>` or `fieldName: null`
  - `targetCompanies`: list company names comma-separated, or `null` if empty
  - `marketingPlan`: if null show `null`; if present and length ≤ 300 show full value; if present and length > 300 show first 300 characters followed by `[truncated — N chars total]`
- If the fetch fails or returns non-OK (any non-2xx status), omit the "Current ROI values:" block and proceed with the original prompt — navigate to `/intelligence` as before. Do NOT abort navigation. Kenji will operate without existing-value context (same as the old behaviour), which is acceptable since failure is unlikely given the user is already authenticated on the events page.
- Inject the block into the prompt **after the event details block and before Step 1**.
- Update **Step 3** to add: *"The prompt contains a 'Current ROI values:' block showing what is already set. For each field you intend to set that already has a non-null value in that block, show `current → proposed` side by side. Ask for explicit confirmation before including that field in the action. Fields currently null can be included without asking."*
- Update **Step 4** capabilities message to explicitly state that `marketingPlan` is included in a single "update all" action — not a separate second action.

### Why this works

The current ROI values are injected into the conversation context at session start. Kenji has the full picture without needing to call any read API. The `marketingPlan` truncation keeps prompt size bounded while still signalling that a plan already exists.

---

## Change 2: `~/.openclaw/workspace/AGENTS.md`

**Location:** The "Event Marketing Plan Behavior" sub-section only (lines 400–411). The global "Behavior Rules" section is NOT changed — these rules apply only within the event marketing plan context.

### Global Behavior Rule 4 — remove ROI navigation link example

The global "Behavior Rules" section has a rule 4 that lists post-operation navigation link examples, including one for `updateROITargets`. Since Change 3 (IntelligenceChat.tsx) now injects this link reliably from the UI, the agent must NOT also emit it (would produce a duplicate). Remove only the ROI line from the example list.

Find and replace this exact text in AGENTS.md:

**Old (verbatim):**
```
4. **Include navigation links** after successful operations. Example:
   - After creating a meeting: `[View meeting →](/events/{eventSlug}/dashboard)`
   - After updating ROI: `[View ROI Targets →](/events/{eventSlug}/roi)`
   - After adding an attendee: `[View attendees →](/events/{eventSlug}/attendees)`
```

**New:**
```
4. **Include navigation links** after successful operations. Example:
   - After creating a meeting: `[View meeting →](/events/{eventSlug}/dashboard)`
   - After adding an attendee: `[View attendees →](/events/{eventSlug}/attendees)`
```

> The ROI navigation link is handled exclusively by the UI (IntelligenceChat.tsx Change 3) to guarantee it always appears. Do not add it back as an agent instruction.

---

### Sub-section Rule 2 — Existing value checking (replace)

Find and replace this exact text in AGENTS.md:

**Old (verbatim):**
```
2. **Confirm existing values before overwriting**: Before emitting a `updateROITargets` [PENDING_ACTION], state the values you intend to set. If the user indicates a field already has a value, show it and ask for explicit confirmation before including it in the args.
```

**New:**
```
2. **Confirm existing values before overwriting**: The prompt includes a "Current ROI values:" block showing what is already set. Before emitting a `updateROITargets` [PENDING_ACTION], list every field you intend to set. For any field whose current value is NOT null in that block, show `current → proposed` and ask for explicit confirmation before including it in the args. Fields currently null can be included without asking.
```

### Sub-section Rule 3 — marketingPlan in same action (replace entirely)

Find and replace this exact text in AGENTS.md:

**Old (verbatim):**
```
3. **Save the marketing plan text**: After the user confirms updating ROI targets, offer a second [PENDING_ACTION] to save the marketing plan narrative itself via `updateROITargets` with `"marketingPlan": "<the full plan text>"`.
```

**New:**
```
3. **Include marketingPlan in the same action**: Include `marketingPlan` in the same `updateROITargets` [PENDING_ACTION] as all other fields. When the user says "update all", one action covers every field including `marketingPlan`. Never propose a separate second action for the marketing plan.
```

### Sub-section Rule 4 — capabilities summary (update existing rule 4 text)

Find and replace this exact text in AGENTS.md:

**Old (verbatim):**
```
4. **Always close event marketing plan responses with this capabilities summary**:
   > "I can update all ROI settings directly for this event — target companies (I'll find or create them by name), expected pipeline, win rate, expected revenue, customer meetings, ERTA (Engagement Rate for Targeted Accounts), speaking, media/PR, budget, requester email, and save the marketing plan text. Tell me which to update, or say 'update all'. For any field that already has a value, I'll show the current value and confirm before overwriting."
```

**New:**
```
4. **Always close event marketing plan responses with this capabilities summary**:
   > "I can update all ROI settings directly for this event in a single action — target companies (I'll find or create them by name), expected pipeline, win rate, expected revenue, customer meetings, ERTA (Engagement Rate for Targeted Accounts), speaking, media/PR, budget, requester email, and the marketing plan text itself. Tell me which to update, or say 'update all'. For any field that already has a value (shown in the Current ROI values block), I'll show the current value and the proposed new value side by side before you confirm."
```

### Sub-section Rule 5 — append after updated rule 4

After the updated rule 4 block (the capabilities summary), append:

```
5. **One action only**: Never split ROI target updates across multiple [PENDING_ACTION] blocks. All fields — numeric targets, target companies, and marketing plan text — go in a single action.
```

> Note: The navigation link to the ROI page after a successful `updateROITargets` is injected by the UI (Change 3) — do NOT add an agent-level rule for it, as that would produce a duplicate link.

---

## Change 3: `components/IntelligenceChat.tsx`

**Location:** The `action_result` WebSocket event handler.

### What changes

When an `action_result` event arrives with `success: true`:

1. **Before calling `setMessages`**, read the current `messages` value from a ref or snapshot to find the matching `PendingActionItem`. Specifically: `const matched = messages.find(m => m.role === 'pending_action' && (m as PendingActionItem).actionId === data.actionId) as PendingActionItem | undefined`. Capture `matched?.tool` in a local variable. This must happen **before** the `setMessages` call — do not attempt to read tool inside the state-setter callback, as the item may have already been mutated.

2. Call `setMessages` to update the matching item's status to `'success'` (existing logic).

3. If the captured `tool === 'updateROITargets'` AND the `eventId` **prop** is non-empty (`IntelligenceChat` already receives `eventId` as a prop derived from `useSearchParams` in the page wrapper — use the prop directly, do not call `useSearchParams()` again inside the component): call `setMessages(prev => [...prev, { role: 'assistant', content: '**[View ROI Targets →](/events/${eventId}/roi)**', id: Date.now().toString() }])` to append the navigation link as a new assistant message.

4. If `eventId` prop is empty/null, skip the injection silently (no broken link).

This is client-side only — no backend changes needed.

---

## Files Changed

| File | Change |
|------|--------|
| `app/events/page.tsx` | Async onClick; sparkle loading state; pre-fetch ROI via `event.id`; inject current values block (truncated marketingPlan); updated Step 3 and Step 4 instructions |
| `~/.openclaw/workspace/AGENTS.md` | Replace rules 2 and 3 in Event Marketing Plan Behavior sub-section; add rules 4 and 5 to that sub-section |
| `components/IntelligenceChat.tsx` | On successful `updateROITargets` action_result, look up tool from pending_action state and inject ROI navigation link |

---

## Out of Scope

- No changes to attendee, company, or meeting sparkle icons (working as intended).
- No changes to ws-proxy.
- No schema or API changes.
- No changes to the ROI page UI (marketingPlan textarea already implemented).
- No auto-navigation (page redirect) — a link injected in the chat is less disruptive than forcing a page change mid-conversation.
- OCCURRED (read-only) events: the sparkle icon remains active. If the user attempts to update an OCCURRED event's ROI, the action will return an error from the API, which Kenji will explain. This is acceptable UX and avoids complicating the sparkle button logic.

---

## Verification

1. Click sparkle on an event card that already has ROI values set.
   - Verify the sparkle button shows a loading indicator while the ROI fetch runs.
   - Verify navigation to `/intelligence?eventId=<slug>` happens after fetch completes.
2. In the intelligence chat, verify the prompt contains a "Current ROI values:" block with correct values.
3. When Kenji proposes targets, verify it lists `current → proposed` for non-null fields and asks for confirmation before proposing the `[PENDING_ACTION]`.
4. Say "update all" — verify ONE `[PENDING_ACTION]` is proposed containing all fields including `marketingPlan`.
5. Confirm the action — verify a "View ROI Targets →" link appears in the chat immediately after the action result card.
6. Click the link — verify it navigates to the correct event's ROI page with updated values including the marketing plan textarea.
7. Click sparkle on an event with no ROI values — verify Kenji updates all fields without asking for confirmation per field, and the single action includes `marketingPlan`.
8. Navigate to `/intelligence` without `?eventId=` — confirm no broken ROI link appears after any action.
