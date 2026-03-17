# OpenClaw Integration

Technical reference for the OpenClaw Insights integration from the event-planner perspective.

---

## 1. Overview

OpenClaw is an open-source AI agent gateway that hosts the "Kenji" market intelligence agent. The integration with event-planner operates in two modes:

- **Real-time chat**: Users connect via WebSocket to ask Kenji questions about companies, attendees, and events
- **Scheduled intelligence**: Kenji runs an autonomous research cycle twice a week, delivering reports to subscribers via email

**Related repos**:
- `~/dev/sales-recon` — Docker stack (ws-proxy + OpenClaw config, `event-planner-cron.py`)
- `~/dev/.openclaw` — Base OpenClaw platform

---

## 2. Architecture

```
Browser (Clerk JWT)
      │  wss:// or ws://
      ▼
ws-proxy (:8080)                    [Node.js container in sales-recon]
  - Verifies Clerk JWT
  - Exchanges Clerk token → action token (POST /api/intelligence/session)
  - Persists chat history per userId (./ws-proxy/data/)
  - Appends [ActionCtx ...] block to each user message
      │  ws://
      ▼
sales-recon-openclaw (:50045)       [OpenClaw + Python + Crawl4AI]
  - AI agent "Kenji"
  - MCP tools: web search (Brave), Crawl4AI web scraping
  - Runs cron jobs: market-intelligence-tuesday / market-intelligence-thursday
      │  HTTP (Bearer CRON_SECRET_KEY)
      ▼
event-planner API (https://...)
  - GET  /api/intelligence/targets      ← fetch research targets
  - POST /api/webhooks/intel-report     ← deliver completed reports
  - POST /api/intelligence/session      ← exchange Clerk JWT for action token
```

Docker network: both containers share `sales-recon-net` (internal) and `webproxy` (external/internet).

---

## 3. Authentication Chain

| Leg | From | To | Credential |
|-----|------|----|------------|
| Browser → ws-proxy | Browser | ws-proxy | Clerk JWT (`?token=<jwt>`) |
| ws-proxy → OpenClaw | ws-proxy | OpenClaw gateway | `OPENCLAW_GATEWAY_TOKEN` shared secret |
| ws-proxy → event-planner session | ws-proxy | `/api/intelligence/session` | `CRON_SECRET_KEY` Bearer token |
| OpenClaw tools → event-planner API | OpenClaw | event-planner | Action token (signed by event-planner, 1-hour TTL) |
| Cron job → event-planner | OpenClaw (curl) | `/api/intelligence/targets`, `/api/webhooks/intel-report` | `CRON_SECRET_KEY` Bearer token |

**Action token** (`lib/action-tokens.ts`): Signed JWT containing `{ userId, role, email }`. ws-proxy obtains it by calling `POST /api/intelligence/session` with the user's Clerk JWT. OpenClaw tools include it in API calls so event-planner can authorize actions without re-validating Clerk.

---

## 4. WebSocket Chat Flow (Real-Time)

1. Browser calls `getToken()` from Clerk, connects to `NEXT_PUBLIC_WS_URL?token=<clerkJwt>[&eventId=<id>]`
2. ws-proxy verifies the Clerk token, extracts `userId`
3. ws-proxy calls `POST /api/intelligence/session` (Bearer `CRON_SECRET_KEY`) with `{ clerkToken, eventId? }` → receives `{ actionToken, userId, role, email, expiresAt, eventSlug? }`
4. ws-proxy loads chat history for this `userId` from disk, sends it to browser as `{ type: "history", messages: [...] }`
5. For each user message, ws-proxy appends `[ActionCtx token=<actionToken> userId=<id> role=<role>]` and forwards to OpenClaw
6. OpenClaw streams back typed frames:
   - `status` — tool status text (e.g. "Searching the web…")
   - `thinking` — internal reasoning (shown dimmed)
   - `tool` — tool invocation name
   - `chunk` — response text fragment
   - `final` — response complete
   - `pending_action` — proposed write action requiring explicit user confirmation (see §4a)
   - `action_result` — result after ws-proxy executes a confirmed action
7. `IntelligenceChat.tsx` renders each frame type with appropriate UI (typing indicator, tool badges, streamed markdown, action confirmation cards)

**Auto-query**: Setting `sessionStorage.intelligenceAutoQuery` before navigating to `/intelligence` causes the component to send that message automatically on connect (used by the event card sparkle icon). The sparkle button is **async**: it pre-fetches current ROI values from `/api/events/[id]/roi` and injects them into the prompt as a `Current ROI values:` block before navigating, so Kenji can compare current vs. proposed values. The button shows a spinner while the fetch is in progress. The prompt instructs Kenji to research the event, generate a marketing plan, draft ROI targets, and then offer to call `updateROITargets` in a single action.

### §4a — Action Confirmation Protocol

Write operations initiated by Kenji require explicit user approval before execution:

1. Kenji calls `/api/intelligence/actions` with a write tool (e.g. `createMeeting`) **without** `confirmed: true`
2. The endpoint returns `{ requires_confirmation: true, preview: { tool, eventId, args } }`
3. ws-proxy sends `{ type: "pending_action", actionId, tool, eventId, preview }` to the browser
4. `IntelligenceChat.tsx` renders an `ActionConfirmCard` with **Confirm** / **Reject** buttons
5. User clicks Confirm → browser sends `{ type: "confirm_action", actionId }` to ws-proxy
   - ws-proxy re-calls `/api/intelligence/actions` with `confirmed: true` and relays the result as `{ type: "action_result", actionId, success: true }`
6. User clicks Reject → browser sends `{ type: "reject_action", actionId }` to ws-proxy
   - ws-proxy sends `{ type: "action_result", actionId, rejected: true }` back to the browser

---

## 5. Cron Intelligence Cycle (Scheduled)

**Schedule**: Tuesdays and Thursdays at 06:00 Central Time
**Cron expressions**: `0 6 * * 2` (Tuesday) and `0 6 * * 4` (Thursday)
**Registered via**: `python event-planner-cron.py` in `~/dev/sales-recon` (calls `openclaw.mjs cron add` inside the container)

The five-step autonomous cycle:

### Step 1 — Fetch Targets
```
GET /api/intelligence/targets
Authorization: Bearer <CRON_SECRET_KEY>
```
Returns:
```json
{
  "companies": [{ "name": "...", "pipelineValue": 0, "subscriptionCount": 1 }],
  "attendees": [{ "name": "...", "title": "...", "company": "...", "subscriptionCount": 1 }],
  "events":    [{ "name": "...", "startDate": "...", "status": "...", "subscriptionCount": 1, "linkedAttendees": [] }]
}
```
Only entities with `subscriptionCount > 0` are researched.

### Step 2 — Research Each Target
- Reads `memory/{Name}.md` to check freshness (skips web search if updated within 48 hours)
- Runs 1–2 web searches per target via Brave/Tavily
- Updates memory file: prepends new findings to `## Latest`; moves overflow to `## Archive`; never overwrites `## Profile` or `## Key Decision Makers` unless facts changed

**Memory file structure**:
```markdown
## Latest        ← 3–8 most recent updates, newest first. Keep ≤ 20 lines.
## Profile       ← Role, bio, background. Static unless facts change.
## Key Decision Makers  ← (companies only) exec table: Name | Role | Recent Topic
## Archive       ← Older entries moved from ## Latest
```

Files: `memory/{Company_Name}.md`, `memory/{First_Last}.md`, `memory/{Event_Name}.md`

### Step 3 — Build Payload
- Reads `memory/Rakuten_Symphony.md` for current strategic positioning
- Constructs `salesAngle` for each target referencing a specific RS initiative vs. the target's current situation
- Payload includes only targets where new intelligence was found (not skipped-fresh targets)

### Step 4 — Deliver
```
POST /api/webhooks/intel-report
Authorization: Bearer <CRON_SECRET_KEY>
Content-Type: application/json

{
  "runId": "YYYY-MM-DD-cron",
  "timestamp": "<ISO 8601>",
  "updatedTargets": [{
    "type": "company" | "attendee" | "event",
    "name": "<exact name from targets>",
    "summary": "<2–3 sentence update>",
    "salesAngle": "<1 sentence: specific RS initiative vs. this target>",
    "fullReport": "<markdown of updated ## Latest section>"
  }]
}
```

### Step 5 — Log
Appends a performance summary to `memory/YYYY-MM-DD.md` inside the OpenClaw container.

---

## 6. Intelligence Report Webhook (`POST /api/webhooks/intel-report`)

Processing steps:
1. **Upsert reports** into `IntelligenceReport` (idempotent on `runId_targetName` composite key)
2. **Fetch upcoming events** (next 30 days, non-canceled) for email context
3. **Match targets to subscribers**: for each active `IntelligenceSubscription`, match updated targets against directly-selected entities and event-linked attendees/companies
4. **Send personalized emails** via nodemailer (highlighted: directly selected; non-highlighted: event-linked)
5. **Send aggregate report** to all root/marketing Clerk users (full target list)
6. **Log** each send to `IntelligenceEmailLog` with status: `sent` / `skipped` / `failed` / `aggregate`

---

## 7. Intelligence Actions API (`POST /api/intelligence/actions`)

OpenClaw tools call this endpoint to read from and write to the event-planner database. Authentication uses the action token (signed JWT, 1-hour TTL) obtained via the session exchange.

**Request body**:
```json
{ "tool": "<tool name>", "eventId": "<UUID or slug>", "args": { ... } }
```

**RBAC enforcement**:
- Action token must be valid (verified by `lib/action-tokens.ts`)
- Write tools require the token's `role` to have write access
- All event-scoped tools check per-event authorization (`authorizedUserIds`)
- Write tools require `args.confirmed = true`; without it the endpoint returns `{ requires_confirmation: true, ... }` and no data is modified

**Available tools**:

| Tool | Type | Description |
|------|------|-------------|
| `listEvents` | read | List all events the token user can access |
| `getEvent` | read | Get full event details |
| `getMeetings` | read | Query meetings (filter by status, attendee, room, date) |
| `createMeeting` | **write** | Create a new meeting |
| `cancelMeeting` | **write** | Cancel a meeting |
| `updateMeeting` | **write** | Update meeting fields; increments `sequence` for calendar versioning |
| `getAttendees` | read | Query attendees |
| `addAttendee` | **write** | Add/upsert an attendee to the event |
| `getRooms` | read | List rooms |
| `getRoomAvailability` | read | Check room availability in a time window |
| `checkAttendeeAvailability` | read | Check attendee schedule conflicts |
| `getROITargets` | read | Fetch ROI targets and actuals |
| `updateROITargets` | **write** | Update ROI targets; accepts `targetCompanyNames` (resolves/creates companies by name) or `targetCompanyIds`; also accepts `marketingPlan` text |
| `updateCompany` | **write** | Update a system-level company record |
| `getNavigationLinks` | read | Return in-app deep-links for a resource |

---

## 8. Intelligence Subscription System

Users subscribe at `/intelligence/subscribe`:
- Select specific attendees, companies, and/or events to track
- Subscription stored in `IntelligenceSubscription` with unique `unsubscribeToken`
- Per-entity toggles: `POST /api/intelligence/subscribe/attendees/[id]`, `companies/[id]`, `events/[id]`
- Email unsubscribe: `GET /api/intelligence/unsubscribe?token=<token>` → sets `active = false`
- Unsubscribe links in emails use `NEXT_PUBLIC_APP_URL` as the base URL

---

## 9. IntelligenceChat Component

**Location**: `components/IntelligenceChat.tsx`
**Pages**: `/intelligence` (standalone), linked from event cards via sparkle icon with `?eventId=`

**Key features**:
- Streaming responses with typing indicator showing tool call status
- "Thinking" messages shown dimmed/italic (internal agent reasoning)
- "New Session" button sends `{ type: "new-session" }` via WebSocket
- PDF download button on each assistant message (uses `lib/markdown-to-pdf.ts`)
- Internal app links (`/events/...`) rendered as styled navigation cards
- Auto-reconnect on disconnect (3-second backoff)

**Auto-query flow**:
```typescript
// Event card sparkle icon (async onClick):
setSparkleLoadingId(event.id)   // shows spinner on button
const roiRes = await fetch(`/api/events/${event.id}/roi`)
// injects 'Current ROI values:' block into prompt if fetch succeeds
sessionStorage.setItem('intelligenceAutoQuery', prompt)
router.push(`/intelligence?eventId=${event.slug || event.id}`)

// IntelligenceChat on connect:
const autoQuery = sessionStorage.getItem('intelligenceAutoQuery')
  || new URLSearchParams(window.location.search).get("autoQuery")
// Sends as first message after 500ms delay to let history load
```

**Message types from ws-proxy**:
| Type | Behavior |
|------|----------|
| `history` | Load prior messages from server |
| `chunk` | Append to current assistant message |
| `status` | Show in typing indicator |
| `thinking` | Append to dimmed system message |
| `tool` | Show tool name in status indicator |
| `final` | Clear waiting state |
| `session-cleared` | Reset UI for new session |
| `user-message` | Echo user message (broadcast from server) |
| `error` | Show error banner |
| `pending_action` | Show `ActionConfirmCard` with Confirm/Reject buttons (`{ actionId, tool, eventId, preview }`) |
| `action_result` | Update action card status (`{ actionId, success?, rejected?, data? }`); if `success=true` and `tool=updateROITargets`, also appends a navigation link card to `/events/[eventId]/roi` in the same state update |

**Messages sent by client to ws-proxy**:
| Type | Payload | Behavior |
|------|---------|----------|
| `confirm_action` | `{ actionId }` | ws-proxy executes the pending action |
| `reject_action` | `{ actionId }` | ws-proxy cancels the pending action |
| `new-session` | — | Reset conversation history |

---

## 10. Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for ws-proxy (e.g., `ws://localhost:8080/`). Falls back to `ws://localhost:8080/` if unset. |
| `CRON_SECRET_KEY` | Bearer token for `/api/intelligence/targets`, `/api/webhooks/intel-report`, `/api/intelligence/session` |
| `NEXT_PUBLIC_APP_URL` | Base URL for unsubscribe links in intelligence emails (e.g., `https://www.aieventplanner.work`) |

**In `sales-recon` Docker stack** (set in `~/dev/sales-recon/.env`):
| Variable | Purpose |
|----------|---------|
| `OPENCLAW_GATEWAY_TOKEN` | Shared secret between ws-proxy and OpenClaw gateway |
| `WS_PROXY_CLERK_SECRET_KEYS` | Clerk secret key(s) for JWT verification in ws-proxy |
| `WEBAPP_URL` | event-planner URL for ws-proxy → session exchange (default: `http://host.docker.internal:3000`) |
| `CRON_SECRET_KEY` | Same value as event-planner's `CRON_SECRET_KEY`; passed to OpenClaw cron prompt |
| `CRON_EVENT_PLANNER_DNS` | Public URL for cron curl calls (e.g., `https://www.aieventplanner.work`) |

---

## 11. Local Development Setup

1. **Start the Docker stack**:
   ```bash
   cd ~/dev/sales-recon
   docker compose up
   ```

2. **Set env var** in `event-planner/.env`:
   ```bash
   NEXT_PUBLIC_WS_URL=ws://localhost:8080/
   ```

3. **Register cron jobs** inside the OpenClaw container:
   ```bash
   cd ~/dev/sales-recon
   python event-planner-cron.py
   ```

4. **OpenClaw CLI alias** for manual interaction:
   ```bash
   sales-recon-openclaw() { docker compose exec -u node sales-recon-openclaw node openclaw.mjs "$@" }
   # Examples:
   sales-recon-openclaw cron list
   sales-recon-openclaw cron rm <job-id>
   ```

5. **Trigger a manual intelligence run** (for testing):
   ```bash
   # From sales-recon dir:
   docker compose exec -u node sales-recon-openclaw node openclaw.mjs agent run main --message "$(cat event-planner-cron.py | python -c 'import sys; exec(sys.stdin.read()); print(CRON_MSG)')"
   ```

6. **View ws-proxy chat history**: stored in `~/dev/sales-recon/ws-proxy/data/` as JSON files per userId.
