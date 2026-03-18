# Intelligence Chat Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the fragile `[PENDING_ACTION]` auto-update mechanism from the sparkle button → `/intelligence` flow and replace the complex ROI-prefetch prompt with a clean structured event-data prompt.

**Architecture:** Four independent changes across three repos: (1) remove the action confirmation UI from the chat component, (2) rewrite the sparkle button prompt logic to fetch full event data and ask for marketing plan + ROI targets as text output, (3) strip all pending-action infrastructure from ws-proxy, (4) remove write-operation instructions from the OpenClaw agent workspace files. Deploy webapp first, then restart ws-proxy, then update workspace files.

**Tech Stack:** Next.js 16 / TypeScript (event-planner repo at `~/dev/event-planner`), Node.js ESM (ws-proxy at `~/dev/sales-recon/ws-proxy/index.js`), Docker / OpenClaw workspace files (inside `sales-recon-openclaw` container at `/home/node/.openclaw/workspace/`).

---

## File Map

| File | Repo | Change |
|------|------|--------|
| `components/IntelligenceChat.tsx` | event-planner | Remove ActionConfirmCard, PendingActionItem, pending_action/action_result handlers |
| `app/events/page.tsx` | event-planner | Replace ROI fetch + complex prompt with full-event fetch + structured prompt |
| `ws-proxy/index.js` | sales-recon | Remove sessionPendingActions map, 3 helper functions, [PENDING_ACTION] parser, 2 message handlers |
| `/home/node/.openclaw/workspace/TOOLS.md` | Docker container | Remove AI Event Planner Write Gateway section |
| `/home/node/.openclaw/workspace/AGENTS.md` | Docker container | Remove AI Event Planner Integration section |

---

## Task 1: Strip Action Confirmation UI from IntelligenceChat.tsx

**Files:**
- Modify: `components/IntelligenceChat.tsx`

All line numbers refer to the current file. Deletions are the only changes — nothing new is added.

- [ ] **Step 1.1: Delete the `ActionConfirmCard` component**

Delete lines 14–67 (the entire `function ActionConfirmCard(...)` block including its JSX return). It spans from `/* ── Action confirmation card ── */` through the closing `}` before `/* ── Typing indicator... ── */`.

- [ ] **Step 1.2: Delete `PendingActionItem` type and `ChatItem` union type**

Delete lines 98–109:
```typescript
type PendingActionItem = {
    role: "pending_action";
    id: string;
    actionId: string;
    tool: string;
    eventId: string;
    preview: string;
    status: "pending" | "confirmed" | "rejected" | "success" | "error";
    resultMessage?: string;
};

type ChatItem = Message | PendingActionItem;
```

- [ ] **Step 1.3: Fix `messages` state type**

On the line that reads:
```typescript
const [messages, setMessages] = useState<ChatItem[]>([]);
```
Change to:
```typescript
const [messages, setMessages] = useState<Message[]>([]);
```

- [ ] **Step 1.4: Delete `pending_action` and `action_result` message handlers**

In `ws.onmessage`, delete the two `else if` blocks — from line 275 through line 324. The block starts at:
```typescript
} else if (data.type === "pending_action") {
```
and ends at the closing `}` of the `action_result` block (which contains the ROI nav link injection logic). After deletion, the next `else if` should be the existing `} else if (data.type === "error") {` block.

- [ ] **Step 1.5: Delete `handleConfirmAction` and `handleRejectAction` functions**

Delete lines 392–415:
```typescript
const handleConfirmAction = (actionId: string) => { ... };

const handleRejectAction = (actionId: string) => { ... };
```

- [ ] **Step 1.6: Delete `pending_action` rendering branch in the messages map**

In the `{messages.map((msg) => { ... })}` block, delete the `if (msg.role === "pending_action")` branch (lines 491–501):
```typescript
if (msg.role === "pending_action") {
    const pItem = msg as PendingActionItem;
    return (
        <ActionConfirmCard
            key={pItem.id}
            item={pItem}
            onConfirm={handleConfirmAction}
            onReject={handleRejectAction}
        />
    );
}
```

- [ ] **Step 1.7: Verify the file compiles**

```bash
cd ~/dev/event-planner
npm run lint
```
Expected: no TypeScript or lint errors related to the removed types. If you see errors about `ChatItem`, `PendingActionItem`, or `ActionConfirmCard` still being referenced somewhere, delete those remaining references.

- [ ] **Step 1.8: Commit**

```bash
cd ~/dev/event-planner
git add components/IntelligenceChat.tsx
git commit -m "refactor: remove action confirmation UI from IntelligenceChat"
```

---

## Task 2: Rewrite the Sparkle Button Prompt in `app/events/page.tsx`

**Files:**
- Modify: `app/events/page.tsx`

- [ ] **Step 2.1: Add `EventDetail` interface**

After the existing `Event` interface (around line 28, before `export default function EventsPage()`), add a new interface for the full event detail response:

```typescript
interface EventDetail {
    id: string
    name: string
    slug: string
    status: string
    startDate: string | null
    endDate: string | null
    timezone: string | null
    region: string | null
    address: string | null
    url: string | null
    boothLocation: string | null
    description: string | null
    tags: string[]
    targetCustomers: string | null
    budget: number | null
}
```

- [ ] **Step 2.2: Add the `buildMarketingPrompt` helper function**

Add this function after the `EventDetail` interface, before `export default function EventsPage()`:

```typescript
function buildMarketingPrompt(e: EventDetail): string {
    const lines: string[] = [
        'You are a B2B event marketing strategist helping Rakuten Symphony plan their attendance at the following event.',
        '',
        '## Event Details',
        '',
    ]

    const add = (label: string, value: string | null | undefined) => {
        if (value != null && value !== '') lines.push(`- **${label}:** ${value}`)
    }

    add('Name', e.name)
    add('Status', e.status)

    // Dates
    if (e.startDate || e.endDate) {
        const start = e.startDate ?? 'TBD'
        const end = e.endDate ?? 'TBD'
        const tz = e.timezone ? ` (${e.timezone})` : ''
        lines.push(`- **Dates:** ${start} – ${end}${tz}`)
    }

    add('Region', e.region)
    add('Location', e.address)
    add('Website', e.url)
    add('Booth', e.boothLocation)
    add('Description', e.description)

    if (e.tags && e.tags.length > 0) {
        lines.push(`- **Themes/Tags:** ${e.tags.join(', ')}`)
    }

    add('Target Customers', e.targetCustomers)

    if (e.budget != null) {
        lines.push(`- **Budget:** $${Math.round(e.budget).toLocaleString('en-US')}`)
    }

    lines.push(
        '',
        '## Your Task',
        '',
        'Using your web search tools to research this event, produce three deliverables:',
        '',
        '### 1. Marketing Plan',
        'A complete, best-practice marketing plan covering the 30 days before the event through 15 days after.',
        'Structure it in phases: Pre-Event, At-Event, Post-Event. Include specific activities, messaging angles,',
        'speaking/PR opportunities, and engagement tactics tied to the event\'s themes.',
        '',
        '### 2. Target Companies',
        'A prioritized list of companies most likely to attend this event that Rakuten Symphony should engage.',
        'For each: company name, why they\'re a strategic target, and recommended engagement approach.',
        '',
        '### 3. Draft ROI Targets',
        'Realistic draft values for all ROI metrics based on the event scale and your research:',
        '- Expected Pipeline (USD)',
        '- Win Rate (%)',
        '- Expected Revenue (USD)',
        '- Target Customer Meetings (count)',
        '- Target ERTA — Engagement Rate for Targeted Accounts (%)',
        '- Target Speaking Engagements (count)',
        '- Target Media/PR Mentions (count)',
        '- Suggested Budget (USD)',
        '- Target Companies list (the companies from deliverable 2, with a brief description of each)',
        '',
        "Ground these numbers in the event's scale, typical industry attendance, and Rakuten Symphony's",
        'position in the Open RAN / telecom space.',
    )

    return lines.join('\n')
}
```

- [ ] **Step 2.3: Replace the sparkle button `onClick` handler**

Find the `onClick` handler on the sparkle button that starts at approximately line 357. It currently contains:
```typescript
setSparkleLoadingId(event.id)
try {
    // Pre-fetch current ROI values so Kenji can see what's already set
    let currentROIBlock = ''
    try {
        const roiRes = await fetch(`/api/events/${event.id}/roi`)
        ...
    }
    const queryParts = [...]
    const prompt = `You are helping plan Rakuten Symphony's attendance...`
    sessionStorage.setItem('intelligenceAutoQuery', prompt)
    router.push(`/intelligence?eventId=${event.slug || event.id}`)
} finally {
    setSparkleLoadingId(null)
}
```

Replace the entire `try/finally` body (keep the `setSparkleLoadingId(event.id)` line and the `finally { setSparkleLoadingId(null) }` wrapper) with:

```typescript
setSparkleLoadingId(event.id)
try {
    const res = await fetch(`/api/events/${event.id}`)
    if (res.ok) {
        const fullEvent: EventDetail = await res.json()
        const prompt = buildMarketingPrompt(fullEvent)
        sessionStorage.setItem('intelligenceAutoQuery', prompt)
    }
    router.push(`/intelligence?eventId=${event.slug || event.id}`)
} finally {
    setSparkleLoadingId(null)
}
```

Note: navigation happens even if the fetch fails (prompt will simply not be set, and the user lands on the intelligence page without an auto-query — graceful degradation).

- [ ] **Step 2.4: Remove the unused `moment` import if no longer used**

Check whether `moment` is used elsewhere in the file. If the only usage was in the old sparkle handler (`moment(event.startDate).format('YYYY-MM-DD')`), remove:
```typescript
import moment from 'moment'
```

- [ ] **Step 2.5: Verify the file compiles**

```bash
cd ~/dev/event-planner
npm run lint
```
Expected: no errors. If `moment` import removal causes a cascading issue, check other uses in the file first.

- [ ] **Step 2.6: Build to verify no type errors**

```bash
cd ~/dev/event-planner
npm run build
```
Expected: build succeeds. The key thing to verify is that `EventDetail` fields are all correctly typed and `buildMarketingPrompt` has no type errors.

- [ ] **Step 2.7: Commit**

```bash
cd ~/dev/event-planner
git add app/events/page.tsx
git commit -m "refactor: replace ROI-prefetch sparkle prompt with structured event-detail prompt"
```

---

## Task 3: Remove Pending Action Infrastructure from `ws-proxy/index.js`

**Files:**
- Modify: `~/dev/sales-recon/ws-proxy/index.js`

All line numbers refer to the current file. Work top-to-bottom to avoid line-number drift.

- [ ] **Step 3.1: Delete the `sessionPendingActions` map**

Delete line 50:
```javascript
const sessionPendingActions = new Map();
```

- [ ] **Step 3.2: Delete `getValidToken()` function**

Delete lines 125–154 (the entire `async function getValidToken(session) { ... }` block).

- [ ] **Step 3.3: Delete `callEventPlannerAction()` function**

Delete lines 156–173 (the entire `async function callEventPlannerAction(token, { tool, eventId, args }) { ... }` block).

- [ ] **Step 3.4: Delete `formatActionPreview()` function**

Delete lines 175–192 (the entire `function formatActionPreview(tool, args) { ... }` block).

- [ ] **Step 3.5: Delete the `[PENDING_ACTION]` parsing block in `handleOpenClawMessage`**

In the `if (payload.state === 'final')` block, delete the pending-action parsing section. Find and delete the following block (approximately lines 484–517):

```javascript
// Parse [PENDING_ACTION] blocks from the complete response
const pendingActionRe = /\[PENDING_ACTION\s+id="([^"]+)"\s+tool="([^"]+)"\s+eventId="([^"]+)"\s+args='([\s\S]*?)'\]/g;
const fullBuf = assistantBuffers.get(sessionKey) || '';
let hasPendingActions = false;
let pendingMatch;
while ((pendingMatch = pendingActionRe.exec(fullBuf)) !== null) {
    const [fullMatch, actionId, tool, eventId, argsStr] = pendingMatch;
    let args;
    try {
        args = JSON.parse(argsStr);
    } catch (e) {
        broadcastToSession(sessionKey, { type: 'action_error', error: `Invalid args JSON in [PENDING_ACTION]: ${e.message}` });
        continue;
    }
    let pending = sessionPendingActions.get(sessionKey);
    if (!pending) {
        pending = {};
        sessionPendingActions.set(sessionKey, pending);
    }
    if (pending[actionId]) {
        console.warn(`[ws-proxy] Duplicate actionId ${actionId} - overwriting`);
    }
    pending[actionId] = { tool, eventId, args, timestamp: Date.now() };
    const preview = formatActionPreview(tool, args);
    broadcastToSession(sessionKey, {
        type: 'pending_action',
        actionId,
        tool,
        eventId,
        preview
    });
    hasPendingActions = true;
    console.log(`[ws-proxy] Parsed [PENDING_ACTION] id=${actionId} tool=${tool} eventId=${eventId}`);
}
```

- [ ] **Step 3.6: Simplify the fallback message condition**

After the deletion above, the fallback message block (approximately lines 520–526) currently reads:
```javascript
const currentBuf = assistantBuffers.get(sessionKey) || '';
if (!currentBuf && !hasPendingActions) {
    const fallbackMsg = "I wasn't able to generate a response. Please try again.";
    broadcastToSession(sessionKey, { type: 'chunk', content: fallbackMsg });
    assistantBuffers.set(sessionKey, fallbackMsg);
}
```

Since `hasPendingActions` is now deleted, simplify to:
```javascript
const currentBuf = assistantBuffers.get(sessionKey) || '';
if (!currentBuf) {
    const fallbackMsg = "I wasn't able to generate a response. Please try again.";
    broadcastToSession(sessionKey, { type: 'chunk', content: fallbackMsg });
    assistantBuffers.set(sessionKey, fallbackMsg);
}
```

- [ ] **Step 3.7: Delete the expired-action cleanup block in `handleBrowserMessage`**

At the top of `handleBrowserMessage`, after the session lookup, delete the expired-action cleanup block (approximately lines 748–756):
```javascript
// Clean up expired pending actions (>10 min)
const sessionPending = sessionPendingActions.get(session.sessionKey);
if (sessionPending) {
    for (const [id, action] of Object.entries(sessionPending)) {
        if (Date.now() - action.timestamp > 10 * 60 * 1000) {
            delete sessionPending[id];
            console.log(`[ws-proxy] Auto-expired pending action ${id}`);
        }
    }
}
```

- [ ] **Step 3.8: Delete the `confirm_action` handler branch**

In `handleBrowserMessage`, delete the entire `} else if (msg.type === 'confirm_action') {` block (approximately lines 785–818). This includes the token fetch, `callEventPlannerAction` call, `sendToBrowser` for the result, the `chatMsg` construction, and the two `broadcastToSession` calls.

- [ ] **Step 3.9: Delete the `reject_action` handler branch**

In `handleBrowserMessage`, delete the entire `} else if (msg.type === 'reject_action') {` block (approximately lines 819–831). This includes the `rejectMsg` construction and the two `broadcastToSession` calls.

- [ ] **Step 3.10: Verify syntax**

```bash
node --check ~/dev/sales-recon/ws-proxy/index.js
```
Expected: exits with code 0, no output (no syntax errors).

- [ ] **Step 3.11: Commit in the sales-recon repo**

```bash
cd ~/dev/sales-recon
git add ws-proxy/index.js
git commit -m "refactor: remove [PENDING_ACTION] protocol and action confirmation infrastructure"
```

---

## Task 4: Update OpenClaw Workspace Files in Docker Container

**Context:** The files live inside the running `sales-recon-openclaw` container at `/home/node/.openclaw/workspace/`. Edit them via `docker compose exec` from `~/dev/sales-recon`. The container user (`node`) owns these files; use `-u 0` (root) only if permission errors occur. Changes take effect on the next agent session start — no container restart needed.

- [ ] **Step 4.1: Remove the write gateway section from `TOOLS.md`**

Read the current file, then write back only the content that remains after deleting the `## AI Event Planner Write Gateway` section:

```bash
cd ~/dev/sales-recon
docker compose exec -u 0 sales-recon-openclaw cat /home/node/.openclaw/workspace/TOOLS.md
```

Identify and delete the entire section that begins with:
```
## AI Event Planner Write Gateway
```
and ends before the next `##` heading (or end of file). This section contains the `[PENDING_ACTION]` format, rules, the write tools table (createMeeting, cancelMeeting, updateMeeting, addAttendee, updateCompany, updateROITargets), and the example output block.

Write the cleaned content back using:
```bash
docker compose exec -u 0 sales-recon-openclaw tee /home/node/.openclaw/workspace/TOOLS.md << 'ENDOFFILE'
<paste the full cleaned TOOLS.md content here>
ENDOFFILE
```

- [ ] **Step 4.2: Verify `TOOLS.md` no longer contains `PENDING_ACTION`**

```bash
cd ~/dev/sales-recon
docker compose exec -u 0 sales-recon-openclaw grep -c "PENDING_ACTION" /home/node/.openclaw/workspace/TOOLS.md
```
Expected: `0`

- [ ] **Step 4.3: Remove the AI Event Planner Integration section from `AGENTS.md`**

```bash
cd ~/dev/sales-recon
docker compose exec -u 0 sales-recon-openclaw cat /home/node/.openclaw/workspace/AGENTS.md
```

Identify and delete the entire section beginning with:
```
## AI Event Planner Integration
```
This section includes: Session Start / ActionCtx parsing, Missing Event Context, Read Operations, Write Operations `[PENDING_ACTION]` protocol, After Confirmation, Behavior Rules, and Event Marketing Plan Behavior (including the capabilities summary instruction at the bottom).

Write the cleaned content back using `tee` as in step 4.1.

- [ ] **Step 4.4: Verify `AGENTS.md` no longer contains `PENDING_ACTION`**

```bash
cd ~/dev/sales-recon
docker compose exec -u 0 sales-recon-openclaw grep -c "PENDING_ACTION" /home/node/.openclaw/workspace/AGENTS.md
```
Expected: `0`

- [ ] **Step 4.5: Verify `AGENTS.md` no longer contains `updateROITargets`**

```bash
cd ~/dev/sales-recon
docker compose exec -u 0 sales-recon-openclaw grep -c "updateROITargets" /home/node/.openclaw/workspace/AGENTS.md
```
Expected: `0`

- [ ] **Step 4.6: Commit the sales-recon repo**

The workspace files are inside the Docker container (not tracked in the sales-recon git repo). This step is a reminder that no git commit is needed for the workspace file changes — they are persisted via Docker volume. However, if you maintain a backup copy of workspace files in `~/dev/sales-recon`, update those too.

---

## Task 5: Deploy and Smoke Test

- [ ] **Step 5.1: Deploy the webapp (must be first)**

```bash
cd ~/dev/event-planner
npm run build
```
Expected: build succeeds with no errors. Deploy as per your normal process.

- [ ] **Step 5.2: Restart ws-proxy**

```bash
cd ~/dev/sales-recon
docker compose restart ws-proxy
```
Expected: container restarts cleanly. Verify with:
```bash
docker compose logs ws-proxy --tail=20
```
Expected log output: `[ws-proxy] Connected to OpenClaw` and `[ws-proxy] Handshake complete, ready for clients`

- [ ] **Step 5.3: Smoke test — sparkle button**

1. Open the event-planner webapp and navigate to `/events`
2. Click the sparkle (✨) icon on any event card — the spinner should appear briefly while the event fetch completes
3. The page navigates to `/intelligence?eventId=<slug>`
4. The intelligence chat auto-sends the structured prompt
5. Kenji begins responding with a marketing plan, target companies, and draft ROI targets — **no `[PENDING_ACTION]` blocks appear**, **no ActionConfirmCard UI appears**

- [ ] **Step 5.4: Smoke test — manual chat**

1. On the `/intelligence` page, type a freeform question
2. Verify responses render normally (markdown, streaming, PDF download button all work)
3. Verify "New Session" and "Get History" buttons work

- [ ] **Step 5.5: Verify no console errors**

Open browser DevTools. Confirm no errors related to:
- `PendingActionItem` or `ActionConfirmCard` (should not appear — they're deleted)
- `pending_action` or `action_result` WebSocket message types (ws-proxy no longer sends them)
- `confirm_action` or `reject_action` (no longer sent by browser)
