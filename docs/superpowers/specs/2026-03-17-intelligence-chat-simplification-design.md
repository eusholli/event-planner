# Intelligence Chat Simplification Design

**Date:** 2026-03-17
**Branch:** multi-event
**Status:** Approved

## Problem

The sparkle-button → `/intelligence` flow is fragile and inconsistent. The current implementation:

1. Pre-fetches ROI values to inject a "Current ROI values:" block into the prompt
2. Instructs the AI to generate auto-update `[PENDING_ACTION]` blocks
3. Requires ws-proxy to parse those blocks and route them through a browser confirmation UI
4. Requires the OpenClaw agent (Kenji) to follow a complex write protocol with UUID generation, confirm/reject flow, and side-by-side current/proposed value display

This multi-layer coordination is the source of fragility. The goal is to remove the entire auto-update mechanism and produce a simpler, more reliable flow where the AI generates content (marketing plan + ROI targets as text) and the user manually applies the recommendations.

## Scope

Four files across three repos:

1. `app/events/page.tsx` (event-planner webapp)
2. `components/IntelligenceChat.tsx` (event-planner webapp)
3. `ws-proxy/index.js` (sales-recon repo)
4. OpenClaw workspace files inside Docker container (`TOOLS.md`, `AGENTS.md`)

---

## Changes

### 1. `app/events/page.tsx` — Sparkle Button

**Remove:**
- Async fetch to `/api/events/[id]/roi`
- All ROI value formatting logic (`currentROIBlock`, `formatVal`, `formatPlan`, `companies` variables)
- The 4-step prompt with Step 4 capabilities summary and auto-update instructions

**Add:**
- Async fetch to `/api/events/[id]` to retrieve full event data
- New structured prompt (see **New Prompt** section below)

The `sparkleLoadingId` spinner state is retained — the button is still async, just fetching different data.

**Fetch and type:** Store the response in a **separate local variable** (e.g. `fullEvent`) typed with its own interface — NOT the existing list-level `Event` interface, which is populated by `/api/events` and does not include `timezone`, `url`, `boothLocation`, `tags`, `targetCustomers`, or `budget`. Use `event.id` (UUID) in the fetch URL.

**Fields used from `/api/events/[id]` response:**
`name`, `status`, `startDate`, `endDate`, `timezone`, `region`, `address`, `url`, `boothLocation`, `description`, `tags`, `targetCustomers`, `budget`, `slug`

**Null/empty handling per field:**
- Any field that is `null`, `undefined`, or empty string: omit its line from the prompt entirely
- `tags`: if array is empty or null, omit the line; otherwise join with `", "`
- `budget`: format as integer USD using `toLocaleString('en-US')` (e.g. `$50,000`); omit if null
- **Dates:** if both `startDate` and `endDate` are present, render `{startDate} – {endDate}`; if only `startDate`, render `{startDate} – TBD`; if only `endDate`, render `TBD – {endDate}`; if neither, omit the dates line entirely. Append ` ({timezone})` only if `timezone` is non-null. Dates rendered as ISO `YYYY-MM-DD` strings as returned by the API.

---

### 2. `components/IntelligenceChat.tsx` — Chat UI

**Remove:**
- `ActionConfirmCard` component (lines 14–67)
- `PendingActionItem` type definition
- `ChatItem` union type (`type ChatItem = Message | PendingActionItem`) — the `messages` state reverts to `Message[]` where `Message` is the existing local interface defined in this file: `{ role: "user" | "assistant" | "system"; content: string; id: string }`
- `pending_action` message handler branch in `ws.onmessage`
- `action_result` message handler branch in `ws.onmessage`, including the ROI nav link injection logic — this UX affordance is intentionally dropped; users will navigate to ROI manually after reviewing the AI's draft targets
- `handleConfirmAction` function
- `handleRejectAction` function
- `pending_action` rendering branch in the messages map (the `if (msg.role === "pending_action")` block)

**Unchanged:** All other message types (`chunk`, `status`, `thinking`, `tool`, `final`, `history`, `session-cleared`, `user-message`, `error`), auto-query sessionStorage logic, PDF download, history button, new-session button, subscribe link.

---

### 3. `ws-proxy/index.js` — WebSocket Proxy

**Remove** (all are self-contained with no other callers in this file):
- `sessionPendingActions` map declaration (top-level state)
- `formatActionPreview()` function — only called from `confirm_action` and `reject_action` handlers
- `callEventPlannerAction()` function — only called from `confirm_action` handler
- `getValidToken()` function — only called from `confirm_action` handler
- `[PENDING_ACTION]` regex parsing block in the `chat.final` handler (the `pendingActionRe` regex, the `while` loop, `hasPendingActions` variable, and the fallback message that references `hasPendingActions`)
- The `hasPendingActions` condition in the fallback message logic — simplify to: if buffer is empty after final, send fallback
- `confirm_action` branch in `handleBrowserMessage`
- `reject_action` branch in `handleBrowserMessage`
- Expired-action cleanup block at the top of `handleBrowserMessage` (the `for...of Object.entries(sessionPending)` loop)
- Success/failure broadcast `chatMsg` + `broadcastToSession` calls in the `confirm_action` handler

**Unchanged:** All connection, authentication, session, history, streaming, `[ActionCtx]` injection in `sendToOpenClaw`, and reconnect logic.

**`[ActionCtx]` note:** The `[ActionCtx]` block injected into every outgoing message is kept as-is. It provides Kenji with the current event context (`appUrl`, `eventId`, `eventSlug`, `role`). Since Kenji's write instructions are removed from AGENTS.md/TOOLS.md, Kenji will simply ignore the token — it will not attempt write operations. No behaviour change occurs for in-flight sessions; any session already open when the workspace files are updated will just lack write instructions going forward.

---

### 4. OpenClaw Workspace (Docker container)

Files are read by Kenji at the start of each session. Changes take effect immediately for new sessions. In-flight sessions will retain their loaded context for the remainder of the session, then pick up the updated instructions on reconnect — no disruptive mid-session behaviour.

**`/home/node/.openclaw/workspace/TOOLS.md`:**

Remove the entire `## AI Event Planner Write Gateway` section, which includes:
- The `[PENDING_ACTION]` pattern format, rules, and example output block
- The write tools reference table (createMeeting, cancelMeeting, updateMeeting, addAttendee, updateCompany, updateROITargets)

**`/home/node/.openclaw/workspace/AGENTS.md`:**

Remove the entire `## AI Event Planner Integration` section, which includes:
- Session start / ActionCtx parsing instructions
- Missing event context handling
- Read operations note
- Write operations `[PENDING_ACTION]` protocol
- After-confirmation behaviour rules
- Event Marketing Plan Behaviour (ROI confirmation and capabilities summary instructions)

---

## New Prompt

Built in `app/events/page.tsx` from the `/api/events/[id]` response. Each field line is only included if the value is non-null and non-empty.

```
You are a B2B event marketing strategist helping Rakuten Symphony plan their attendance at the following event.

## Event Details

- **Name:** {name}
- **Status:** {status}
- **Dates:** {startDate} – {endDate} ({timezone})
- **Region:** {region}
- **Location:** {address}
- **Website:** {url}
- **Booth:** {boothLocation}
- **Description:** {description}
- **Themes/Tags:** {tags joined with ", "}
- **Target Customers:** {targetCustomers}
- **Budget:** ${budget}

## Your Task

Using your web search tools to research this event, produce three deliverables:

### 1. Marketing Plan
A complete, best-practice marketing plan covering the 30 days before the event through 15 days after.
Structure it in phases: Pre-Event, At-Event, Post-Event. Include specific activities, messaging angles,
speaking/PR opportunities, and engagement tactics tied to the event's themes.

### 2. Target Companies
A prioritized list of companies most likely to attend this event that Rakuten Symphony should engage.
For each: company name, why they're a strategic target, and recommended engagement approach.

### 3. Draft ROI Targets
Realistic draft values for all ROI metrics based on the event scale and your research:
- Expected Pipeline (USD)
- Win Rate (%)
- Expected Revenue (USD)
- Target Customer Meetings (count)
- Target ERTA — Engagement Rate for Targeted Accounts (%)
- Target Speaking Engagements (count)
- Target Media/PR Mentions (count)
- Suggested Budget (USD)
- Target Companies list (the companies from deliverable 2, with a brief description of each)

Ground these numbers in the event's scale, typical industry attendance, and Rakuten Symphony's
position in the Open RAN / telecom space.
```

---

## What Is NOT Changed

- WebSocket connection, authentication, reconnect logic
- Chat history fetch and display
- Session management (new-session, session-cleared)
- `[ActionCtx]` injection in ws-proxy
- All read-only streaming message types: chunk, status, thinking, tool, final
- PDF download button on assistant messages
- History button, subscribe link, new session button
- The `/api/intelligence/actions` endpoint — retained as-is; write tools remain available for future use or other callers (e.g. cron-triggered intelligence actions), they are simply no longer prompted by the sparkle flow
- Cron job and intelligence report webhook

---

## Deployment Sequence

**Recommended order:**

1. **Deploy webapp first** — removes `ActionConfirmCard` UI so users can no longer click Confirm on any pending-action cards
2. **Restart ws-proxy:** `docker compose restart ws-proxy` in `~/dev/sales-recon` — removes `confirm_action`/`reject_action` handler branches
3. **Update OpenClaw workspace files** via `docker compose exec -u 0 sales-recon-openclaw` — no restart needed; takes effect on next session start

**Why this order:** If ws-proxy is restarted before the webapp is deployed, a brief window exists where old browser sessions still show ActionConfirmCard buttons but ws-proxy no longer handles `confirm_action` — producing an "Unknown message type" error. Deploying webapp first eliminates this edge case.
