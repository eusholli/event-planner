# Technical Concerns

## Tech Debt

### Type Safety
- **106+ `as any` assertions** — widespread suppression of TypeScript's type checker across components and API routes. Creates silent type errors in production.
- **Inline interface duplication** — `Meeting`, `Attendee`, `Room` interfaces redefined in multiple components rather than shared from a central types file.
- **`lib/enrichment.ts` is a stub** — documented as mock service returning dummy data. Real enrichment happens in `/api/attendees/autocomplete` (Gemini call). The file is misleading dead code.

### Code Organization
- **Oversized components** — several client components are 600-900 lines (`app/events/[id]/calendar/page.tsx`, `components/IntelligenceChat.tsx`). Hard to maintain and reason about.
- **Debug logging in production** — `console.log` statements left in production code paths including the AI chat route. Generates noise in logs.
- **Role utilities split across files** — `lib/roles.ts` (server), `lib/role-utils.ts` (client), `lib/access.ts` (per-event access). Overlapping concerns.

### Configuration
- **Gemini API key stored in DB** — `SystemSettings` table holds the Gemini key rather than an environment variable. No key rotation mechanism; key not encrypted at rest.
- **Missing environment variable validation** — no startup validation of required env vars (SMTP, R2, Mapbox, etc.). Silent failures when vars missing.

## Known Bugs

### Authorization
- **Missing event access check on GET /api/meetings** — the meeting list endpoint may not verify that the requesting user has access to the parent event. Admin/user roles could access meetings from unauthorized events.

### UI
- **Chat debug statement on every render** — a `console.log` in the chat component executes on each render cycle, not just on mount.

### Database
- **Redundant queries** — some API handlers fetch the same entity multiple times (e.g., event lookup by slug, then by ID) within a single request.

## Security Issues

### Authentication & Authorization
- **Action token without key rotation** — OpenClaw action tokens are signed with a static `CRON_SECRET_KEY`. No rotation schedule or revocation mechanism.
- **Mock auth risk** — `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true` grants root access. If accidentally set in production, full system compromise. No guard against this.
- **Webhook verification absent** — `/api/webhooks/intel-report` authenticates via `CRON_SECRET_KEY` Bearer token. No HMAC signature verification.
- **Missing rate limiting** — API routes have no rate limiting. Intelligence actions endpoint (`/api/intelligence/actions`) is particularly sensitive.

### Data
- **Sensitive data in localStorage** — AI chat history stored in localStorage (per CLAUDE.md). 5MB browser limit; no encryption.
- **`sessionStorage.intelligenceAutoQuery`** — prompt injection surface: event data (ROI values, company names) injected directly into AI prompt from API response. No sanitization.

## Performance Bottlenecks

### API
- **Synchronous email sending** — `nodemailer` calls in `/api/meetings/[id]/email` block the response. Large recipient lists will timeout.
- **Synchronous image proxy** — `/api/image-proxy` fetches external images synchronously, blocking the response.
- **In-process PDF generation** — `jspdf` runs in the API handler. Large briefing books will spike memory and block the Node.js event loop.

### Database
- **Fixed connection pool** — `@prisma/adapter-pg` pool size not tuned. Default may be too small under load or too large for serverless.
- **N+1 patterns** — some list endpoints may issue per-row queries for relations (e.g., attendees with company data).

### Frontend
- **No pagination on attendee/meeting lists** — all records loaded at once. Will degrade with large datasets.
- **WebSocket reconnection overhead** — `IntelligenceChat.tsx` reconnects to ws-proxy on component mount. Rapid navigation creates connection churn.

## Fragile Areas

### Slug Generation
- **Race condition** — slug uniqueness check + insert is not atomic. Concurrent event creation could produce duplicate slugs before the random suffix kicks in.

### Calendar/ICS
- **Untested email delivery** — ICS invite generation (`lib/calendar-sync.ts`) has no integration tests. Format errors would only surface in production.
- **`sequence` field dependency** — calendar clients (Google Calendar, Outlook) require monotonically increasing `sequence` on meeting updates. Off-by-one or missed increments break invite updates silently.

### WebSocket Protocol
- **Unchecked WebSocket message parsing** — `IntelligenceChat.tsx` parses `JSON.parse(event.data)` without try/catch in some code paths. Malformed messages crash the component.

## Scaling Limits

| Concern | Current Limit | Impact |
|---------|--------------|--------|
| Chat history | localStorage 5MB | Lost history when full |
| Connection pool | Default pg pool | Slow under concurrent load |
| PDF generation | In-process | Memory spikes, timeouts |
| Image proxy | Synchronous fetch | Blocks on slow external URLs |
| WebSocket | Single ws-proxy container | No horizontal scaling |
| Intelligence cron | Fixed schedule | Cannot trigger ad-hoc runs |

## Missing Operational Concerns

- **No health check endpoint** — no `/api/health` or `/api/status` for load balancer probes
- **No structured logging** — `console.log/error` only; no log levels, correlation IDs, or structured JSON
- **No DB migration rollback strategy** — `prisma migrate deploy` is one-way; no documented rollback plan
- **No alerting** — Sentry captures errors but no alert thresholds configured (documented assumption)
- **Branch/DB coupling** — `main` and `multi-event` branches use separate DBs; merging accidentally could corrupt production data (see `DB_WORKFLOW.md`)
