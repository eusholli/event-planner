# Event Sparkle ROI Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the event sparkle → ROI intelligence flow so that (1) existing ROI values are pre-fetched and shown to Kenji before it proposes updates, (2) `marketingPlan` is included in a single "update all" action, and (3) a "View ROI Targets →" navigation link appears in the chat after a successful update.

**Architecture:** Three independent changes: (1) AGENTS.md text replacements to fix agent behaviour, (2) async sparkle onClick in `app/events/page.tsx` to pre-fetch current ROI and inject into prompt, (3) `components/IntelligenceChat.tsx` action_result handler extension to inject the ROI navigation link. No schema, API, or ws-proxy changes needed.

**Tech Stack:** Next.js 16, TypeScript, React, Tailwind CSS, OpenClaw workspace (AGENTS.md markdown).

---

## Chunk 1: AGENTS.md — Fix Agent Behaviour Rules

**Spec:** `docs/superpowers/specs/2026-03-16-event-sparkle-roi-fix-design.md` — Change 2

### Task 1: Apply all AGENTS.md text replacements

**Files:**
- Modify: `~/.openclaw/workspace/AGENTS.md`

The file has 5 replacements. Apply them in order. All old strings are verbatim — they must match exactly.

- [ ] **Step 1: Remove the ROI navigation link from global Behavior Rule 4**

  In `~/.openclaw/workspace/AGENTS.md`, find and replace:

  **Old (exact):**
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

- [ ] **Step 2: Replace sub-section Rule 2 (existing value checking)**

  Find and replace:

  **Old (exact):**
  ```
  2. **Confirm existing values before overwriting**: Before emitting a `updateROITargets` [PENDING_ACTION], state the values you intend to set. If the user indicates a field already has a value, show it and ask for explicit confirmation before including it in the args.
  ```

  **New:**
  ```
  2. **Confirm existing values before overwriting**: The prompt includes a "Current ROI values:" block showing what is already set. Before emitting a `updateROITargets` [PENDING_ACTION], list every field you intend to set. For any field whose current value is NOT null in that block, show `current → proposed` and ask for explicit confirmation before including it in the args. Fields currently null can be included without asking.
  ```

- [ ] **Step 3: Replace sub-section Rule 3 (marketingPlan in same action)**

  Find and replace:

  **Old (exact):**
  ```
  3. **Save the marketing plan text**: After the user confirms updating ROI targets, offer a second [PENDING_ACTION] to save the marketing plan narrative itself via `updateROITargets` with `"marketingPlan": "<the full plan text>"`.
  ```

  **New:**
  ```
  3. **Include marketingPlan in the same action**: Include `marketingPlan` in the same `updateROITargets` [PENDING_ACTION] as all other fields. When the user says "update all", one action covers every field including `marketingPlan`. Never propose a separate second action for the marketing plan.
  ```

- [ ] **Step 4: Replace sub-section Rule 4 (capabilities summary)**

  Find and replace:

  **Old (exact):**
  ```
  4. **Always close event marketing plan responses with this capabilities summary**:
     > "I can update all ROI settings directly for this event — target companies (I'll find or create them by name), expected pipeline, win rate, expected revenue, customer meetings, ERTA (Engagement Rate for Targeted Accounts), speaking, media/PR, budget, requester email, and save the marketing plan text. Tell me which to update, or say 'update all'. For any field that already has a value, I'll show the current value and confirm before overwriting."
  ```

  **New:**
  ```
  4. **Always close event marketing plan responses with this capabilities summary**:
     > "I can update all ROI settings directly for this event in a single action — target companies (I'll find or create them by name), expected pipeline, win rate, expected revenue, customer meetings, ERTA (Engagement Rate for Targeted Accounts), speaking, media/PR, budget, requester email, and the marketing plan text itself. Tell me which to update, or say 'update all'. For any field that already has a value (shown in the Current ROI values block), I'll show the current value and the proposed new value side by side before you confirm."
  ```

- [ ] **Step 5: Append new Rule 5 (one action only) after the updated Rule 4 block**

  After the closing `"` of the updated rule 4 capabilities summary quote, append a blank line and then:

  ```
  5. **One action only**: Never split ROI target updates across multiple [PENDING_ACTION] blocks. All fields — numeric targets, target companies, and marketing plan text — go in a single action.
  ```

  The sub-section should end with Rule 5 and then a blank line (or the next section heading).

- [ ] **Step 6: Verify changes**

  Run these greps to confirm each replacement landed correctly (line numbers shift after edits — use content search instead):

  ```bash
  grep -n "View ROI Targets" ~/.openclaw/workspace/AGENTS.md
  ```
  Expected: **no output** (ROI navigation link removed from global Behavior Rule 4).

  ```bash
  grep -n "Current ROI values" ~/.openclaw/workspace/AGENTS.md
  ```
  Expected: 1 line — the updated sub-section Rule 2.

  ```bash
  grep -n "separate second action" ~/.openclaw/workspace/AGENTS.md
  ```
  Expected: 1 line — the new sub-section Rule 3 ("Never propose a separate second action").

  ```bash
  grep -n "One action only" ~/.openclaw/workspace/AGENTS.md
  ```
  Expected: 1 line — the new sub-section Rule 5.

- [ ] **Step 7: Commit**

  ```bash
  cd ~/.openclaw && git add workspace/AGENTS.md
  git commit -m "fix: update ROI behavior rules — single action, pre-fetched values, no duplicate nav link"
  ```

---

## Chunk 2: `app/events/page.tsx` — Async Sparkle with ROI Pre-fetch

**Spec:** `docs/superpowers/specs/2026-03-16-event-sparkle-roi-fix-design.md` — Change 1

### Task 2: Add sparkleLoadingId state and make sparkle onClick async

**Files:**
- Modify: `app/events/page.tsx`

The current sparkle `onClick` is synchronous (lines 356–367). It needs to become async, add a loading state, fetch ROI data, build a "Current ROI values:" block, and inject it into the prompt.

- [ ] **Step 1: Add `sparkleLoadingId` state**

  In `app/events/page.tsx`, find the existing `useState` declarations (around lines 31–44). After line 44 (`const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)`), add:

  ```tsx
  const [sparkleLoadingId, setSparkleLoadingId] = useState<string | null>(null)
  ```

- [ ] **Step 2: Replace the sparkle onClick with the async version**

  In `app/events/page.tsx`, find and replace the sparkle button's `onClick` using this verbatim old string as the anchor (the beginning of the handler):

  **Old (exact start — use this to locate the block):**
  ```tsx
  onClick={(e) => {
                                                                e.stopPropagation()
                                                                const queryParts = [
                                                                    `Event Name: ${event.name}`,
  ```

  Replace the **entire** `onClick={(e) => { ... }}` block (from `onClick={(e) => {` through the closing `}}`) with:

  ```tsx
  onClick={async (e) => {
      e.stopPropagation()
      setSparkleLoadingId(event.id)
      try {
          // Pre-fetch current ROI values so Kenji can see what's already set
          let currentROIBlock = ''
          try {
              const roiRes = await fetch(`/api/events/${event.id}/roi`)
              if (roiRes.ok) {
                  const roiData = await roiRes.json()
                  const t = roiData?.targets || {}
                  const formatVal = (v: any) => (v === null || v === undefined) ? 'null' : String(v)
                  const formatPlan = (v: string | null | undefined) => {
                      if (!v) return 'null'
                      return v.length > 300 ? `${v.slice(0, 300)} [truncated — ${v.length} chars total]` : v
                  }
                  const companies = t.targetCompanies?.length
                      ? t.targetCompanies.map((c: { name: string }) => c.name).join(', ')
                      : 'null'
                  currentROIBlock = `\nCurrent ROI values:\n- expectedPipeline: ${formatVal(t.expectedPipeline)}\n- winRate: ${formatVal(t.winRate)}\n- expectedRevenue: ${formatVal(t.expectedRevenue)}\n- targetCustomerMeetings: ${formatVal(t.targetCustomerMeetings)}\n- targetErta: ${formatVal(t.targetErta)}\n- targetSpeaking: ${formatVal(t.targetSpeaking)}\n- targetMediaPR: ${formatVal(t.targetMediaPR)}\n- budget: ${formatVal(t.budget)}\n- requesterEmail: ${formatVal(t.requesterEmail)}\n- targetCompanies: ${companies}\n- marketingPlan: ${formatPlan(t.marketingPlan)}\n`
              }
          } catch {
              // Silently skip — Kenji will operate without existing-value context
          }

          const queryParts = [
              `Event Name: ${event.name}`,
              `Region: ${event.region || 'Unknown'}`,
              `Date: ${event.startDate ? moment(event.startDate).format('YYYY-MM-DD') : 'Unknown'} - ${event.endDate ? moment(event.endDate).format('YYYY-MM-DD') : 'Unknown'}`,
              `Location: ${event.address || 'Unknown'}`,
          ]
          const prompt = `You are helping plan Rakuten Symphony's attendance at this event. Please complete these steps in order:\n\n**Step 1 — Research the event**\nUse your web search tools to discover the event's main themes, focus areas, and confirmed or likely attending companies (exhibitors, sponsors, keynote speakers).\n\n**Step 2 — Generate the marketing plan**\nWrite the best possible Rakuten Symphony event marketing plan. Include:\n- Narrative strategy (why this event matters for RS and what the primary goals should be)\n- Top companies to engage, ranked by strategic importance to Rakuten Symphony\n- Key speaking, PR, and media opportunities\n\n**Step 3 — Draft ROI targets**\nGenerate realistic quantitative targets for each metric with a one-sentence explanation:\n- Expected Pipeline (USD)\n- Win Rate (%)\n- Expected Revenue (USD — auto-calculated as Pipeline × Win Rate)\n- Target Customer Meetings (count)\n- Target ERTA — Engagement Rate for Targeted Accounts (% — measures engagements from employees at targeted companies divided by total employees from targeted companies reached)\n- Target Speaking engagements (count)\n- Target Media/PR mentions (count)\n- Suggested Budget (USD)\n\nThe prompt contains a 'Current ROI values:' block below showing what is already set for this event. For each field you intend to set that already has a non-null value in that block, show \`current → proposed\` side by side and ask for explicit confirmation before including that field in the action. Fields currently null can be included without asking.\n\n**Step 4 — Capabilities summary**\nClose with exactly this message to the user:\n"I can update all of these ROI settings directly for this event in a single action — target companies (I'll find or create them by name), expected pipeline, win rate, expected revenue, customer meetings, ERTA (Engagement Rate for Targeted Accounts), speaking, media/PR, budget, requester email, and the marketing plan text itself. Tell me which fields to update, or say 'update all'. For any field that already has a value (shown in Current ROI values below), I'll show you the current value and proposed new value side by side before you confirm. One action covers everything — no separate step for the marketing plan."\n\nEvent details:\n\n${queryParts.join('\n')}${currentROIBlock}`
          sessionStorage.setItem('intelligenceAutoQuery', prompt)
          router.push(`/intelligence?eventId=${event.slug || event.id}`)
      } finally {
          setSparkleLoadingId(null)
      }
  }}
  ```

- [ ] **Step 3: Add loading indicator to the sparkle button**

  The sparkle button currently renders `<Sparkles className="w-4 h-4" />`. Replace the button's contents with a conditional:

  ```tsx
  {sparkleLoadingId === event.id ? (
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
  ) : (
      <Sparkles className="w-4 h-4" />
  )}
  ```

  Also add `disabled={sparkleLoadingId === event.id}` to the button element and append `disabled:opacity-50 disabled:cursor-wait` to its `className`.

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd ~/dev/event-planner && npm run build 2>&1 | grep -E "error TS|Type error" | head -20
  ```

  Expected: no TypeScript errors. If errors appear, fix them before continuing.

- [ ] **Step 5: Manual smoke test**

  ```bash
  npm run dev
  ```

  Open `http://localhost:3000/events`. Click the sparkle (✦) on any event card. Verify:
  - The sparkle icon briefly shows a spinner while loading
  - Navigation proceeds to `/intelligence?eventId=<slug>`
  - No console errors in the browser devtools

- [ ] **Step 6: Commit**

  ```bash
  git add app/events/page.tsx
  git commit -m "feat: async sparkle onClick — pre-fetch existing ROI values and inject into prompt"
  ```

---

## Chunk 3: `components/IntelligenceChat.tsx` — ROI Navigation Link After Success

**Spec:** `docs/superpowers/specs/2026-03-16-event-sparkle-roi-fix-design.md` — Change 3

### Task 3: Inject ROI navigation link after successful updateROITargets

**Files:**
- Modify: `components/IntelligenceChat.tsx`

The `action_result` handler is at lines 286–300. It currently only updates the `PendingActionItem` status. It needs to also inject a navigation link when the tool is `updateROITargets` and `eventId` is non-empty.

- [ ] **Step 1: Extend the action_result handler**

  Find this exact block in `components/IntelligenceChat.tsx` (lines 286–301):

  ```typescript
  } else if (data.type === "action_result") {
      setMessages((prev) =>
          prev.map((item) => {
              if (item.role !== "pending_action") return item;
              const pItem = item as PendingActionItem;
              if (pItem.actionId !== data.actionId) return item;
              if (data.rejected) {
                  return { ...pItem, status: "rejected" };
              } else if (data.success) {
                  return { ...pItem, status: "success" };
              } else {
                  return { ...pItem, status: "error", resultMessage: data.data?.error || "Unknown error" };
              }
          })
      );
  }
  ```

  Replace it with:

  ```typescript
  } else if (data.type === "action_result") {
      // Single setMessages call — reads tool from `prev` (always current state,
      // no stale-closure risk) and conditionally appends the ROI nav link
      // in the same update.
      setMessages((prev) => {
          // Find the matching action to capture its tool name
          const matched = prev.find(
              (m) => m.role === "pending_action" && (m as PendingActionItem).actionId === data.actionId
          ) as PendingActionItem | undefined;

          const updated = prev.map((item) => {
              if (item.role !== "pending_action") return item;
              const pItem = item as PendingActionItem;
              if (pItem.actionId !== data.actionId) return item;
              if (data.rejected) {
                  return { ...pItem, status: "rejected" };
              } else if (data.success) {
                  return { ...pItem, status: "success" };
              } else {
                  return { ...pItem, status: "error", resultMessage: data.data?.error || "Unknown error" };
              }
          });

          // Inject ROI navigation link for successful updateROITargets actions
          // eventId is the prop received by IntelligenceChat — do NOT call useSearchParams() here
          if (data.success && matched?.tool === "updateROITargets" && eventId) {
              return [
                  ...updated,
                  {
                      role: "assistant" as const,
                      content: `**[View ROI Targets →](/events/${eventId}/roi)**`,
                      id: `roi-nav-${data.actionId}`,
                  },
              ];
          }

          return updated;
      });
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd ~/dev/event-planner && npm run build 2>&1 | grep -E "error TS|Type error" | head -20
  ```

  Expected: no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

  With `npm run dev` running:
  1. Navigate to `/intelligence?eventId=<any-event-slug>`
  2. Trigger a `updateROITargets` pending action (or test by manually sending a `confirm_action` via browser devtools if no OpenClaw session available — if the Docker stack is running, this is easiest via the sparkle flow)
  3. After confirming, verify a "View ROI Targets →" link appears as a new chat message
  4. Navigate to `/intelligence` without `?eventId=` — confirm the ROI link does NOT appear after any action (no broken link)

- [ ] **Step 4: Commit**

  ```bash
  git add components/IntelligenceChat.tsx
  git commit -m "feat: inject ROI navigation link in chat after successful updateROITargets"
  ```

---

## Final Verification

End-to-end test of the complete fix:

1. Start the dev server: `cd ~/dev/event-planner && npm run dev`
2. Start Docker stack (for OpenClaw / ws-proxy): `cd ~/dev/sales-recon && docker compose up`
3. Open `/events` — find an event that already has some ROI values set
4. Click the sparkle (✦) icon — verify:
   - Spinner shows briefly on the icon during the ROI fetch
   - Navigation proceeds to `/intelligence?eventId=<slug>`
5. In the chat, verify the auto-sent prompt contains a `Current ROI values:` block with the correct field values
6. Let Kenji complete its response — verify it shows `current → proposed` for any non-null fields and asks confirmation before including them
7. Say `update all` — verify ONE `[PENDING_ACTION]` is proposed containing all fields including `marketingPlan`
8. Confirm the action — verify a `View ROI Targets →` link appears immediately in the chat
9. Click the link — verify it navigates to the correct event ROI page with all updated values including the marketing plan textarea
10. Repeat steps 3–9 with an event that has NO existing ROI values — verify Kenji proposes all fields in one action without per-field confirmation
