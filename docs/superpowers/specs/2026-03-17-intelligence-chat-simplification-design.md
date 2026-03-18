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
4. OpenClaw workspace files inside Docker container (TOOLS.md, AGENTS.md)

## Changes

### 1. `app/events/page.tsx` — Sparkle Button

**Remove:**
- Async fetch to `/api/events/[id]/roi`
- All ROI value formatting logic (`currentROIBlock`, `formatVal`, `formatPlan`, `companies` vars)
- The 4-step prompt with Step 4 capabilities summary and auto-update instructions

**Add:**
- Async fetch to `/api/events/[id]` to retrieve full event data (url, boothLocation, timezone, tags, targetCustomers, budget, and all existing fields)
- New structured prompt (see Prompt section below)

The spinner UX (`sparkleLoadingId` state) is retained — the button is still async, just fetching different data.

### 2. `components/IntelligenceChat.tsx` — Chat UI

**Remove:**
- `ActionConfirmCard` component (lines 14–67)
- `PendingActionItem` type definition
- `ChatItem` union type — simplify back to just `Message[]`
- `pending_action` message handler in `ws.onmessage`
- `action_result` message handler in `ws.onmessage` (including ROI nav link injection)
- `handleConfirmAction` function
- `handleRejectAction` function
- `pending_action` rendering branch in the messages map

**Unchanged:** All other message types (chunk, status, thinking, tool, final, history, session-cleared, user-message, error), auto-query logic, PDF download, history button, session management.

### 3. `ws-proxy/index.js` — WebSocket Proxy

**Remove:**
- `sessionPendingActions` map declaration
- `formatActionPreview()` function
- `callEventPlannerAction()` function
- `getValidToken()` function
- `[PENDING_ACTION]` regex parsing block in the `chat.final` handler (lines 484–517)
- `hasPendingActions` variable and related logic in `chat.final`
- `confirm_action` branch in `handleBrowserMessage`
- `reject_action` branch in `handleBrowserMessage`
- Expired-action cleanup block at the top of `handleBrowserMessage`
- Success/failure broadcast messages after action execution

**Unchanged:** All connection, authentication, session, history, streaming, `[ActionCtx]` injection, and reconnect logic.

### 4. OpenClaw Workspace (Docker container)

**`/home/node/.openclaw/workspace/TOOLS.md`:**
Remove the entire `## AI Event Planner Write Gateway` section, which contains:
- The `[PENDING_ACTION]` pattern format and rules
- The write tools table (createMeeting, cancelMeeting, updateMeeting, addAttendee, updateCompany, updateROITargets)
- The example output block

**`/home/node/.openclaw/workspace/AGENTS.md`:**
Remove the entire `## AI Event Planner Integration` section, which contains:
- Session start / ActionCtx parsing instructions
- Missing event context handling
- Read operations note
- Write operations `[PENDING_ACTION]` protocol
- After confirmation behavior
- Behavior rules (confirm intent, one action at a time, etc.)
- Event Marketing Plan Behavior (the ROI confirmation and capabilities summary instructions)

## New Prompt

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
- **Themes/Tags:** {tags}
- **Target Customers:** {targetCustomers}
- **Budget:** {budget}

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

Fields that are null/empty are omitted from the prompt (not rendered as "null").

## What Is NOT Changed

- WebSocket connection, authentication, reconnect logic
- Chat history fetch and display
- Session management (new-session, session-cleared)
- `[ActionCtx]` injection in ws-proxy (still provides event context to Kenji)
- All read-only streaming: chunk, status, thinking, tool, final
- PDF download button on assistant messages
- History button, subscribe link, new session button
- The `/api/intelligence/actions` endpoint and its write tools (not removed, just not triggered)
- Cron job and intelligence report webhook

## Deployment Note

The OpenClaw workspace changes take effect immediately (files are read at session start). No container rebuild required. The ws-proxy change requires a container restart (`docker compose restart ws-proxy` in the sales-recon repo). The webapp changes require a Next.js rebuild/redeploy.
