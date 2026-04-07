# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Event Planner is a Next.js 16 application for managing multi-event conferences with attendees, meetings, and schedules. Built with Prisma (PostgreSQL), Tailwind CSS v4, Clerk authentication, Vercel AI SDK 5.0, and Google Gemini 2.5 Pro. Requires Node.js >=24.0.0.

## Development Commands

```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Build for production (DB check + migrate + build)
npm run lint             # Run ESLint
npx prisma studio        # Open Prisma Studio GUI
npx prisma migrate dev   # Create and apply migration
npm run db:main          # Switch to main branch database (.env.main -> .env)
npm run db:multi         # Switch to multi-event database (.env.multi -> .env)
```

## Required Post-Change Checks

- **After any database schema change** (`prisma/schema.prisma` or migrations): run `/sync-schema-exports` to audit all import/export surfaces and fix any misaligned fields or missing models.
- **After adding any new feature or API route that may be role-restricted**: run `/rbac-check` to verify RBAC correctness — withAuth coverage, permission helper usage, and per-route policy conformance.

**Database switching**: `npm run db:main/multi` copies the specified `.env.*` file to `.env` and regenerates the Prisma client. Use `db:main` on the `main` branch and `db:multi` on the `multi-event` branch.

## Branch & Database Strategy

Two branches with divergent schemas use separate databases:
- `main` branch → `npm run db:main` (V1, single event)
- `multi-event` branch → `npm run db:multi` (V2, multi event)

**Critical migration rule**: You may merge `main` into `multi-event`, but NEVER merge `multi-event` into `main`. When merging `main` into `multi-event`, delete any new migration folders that came from `main` (they're invalid for V2 schema) and re-run `npx prisma migrate dev --name <feature>` to generate a V2-compatible migration. See `DB_WORKFLOW.md` for details.

## Architecture

### Multi-Event System

Events are accessed via `/events/[id]/*` routes where `[id]` can be UUID or slug. All event-scoped API routes resolve both to the canonical UUID:

```typescript
const event = await prisma.event.findFirst({
  where: { OR: [{ id: eventId }, { slug: eventId }] }
})
const resolvedEventId = event.id
```

### Database Layer (`lib/prisma.ts`)

- Uses `@prisma/adapter-pg` for connection pooling (not default Prisma client)
- Automatically handles local vs. remote SSL configuration
- Singleton pattern with global caching in development

**Key Models**:
- `SystemSettings` - Global settings (Gemini API key, default types/tags)
- `Event` - Top-level container with slug routing, `authorizedUserIds` for per-event access, ROI targets (including `marketingPlan` text field)
- `Attendee` - System-level with unique email. Links to a `Company` relation via `companyId`. Shared across events via many-to-many
- `Meeting` - Event-scoped; `MeetingStatus` enum: `PIPELINE/CONFIRMED/OCCURRED/CANCELED`; has `sequence` field incremented on updates for calendar invite versioning
- `Event` status workflow: `PIPELINE` (amber) → `COMMITTED` (green) → `OCCURRED` (grey, read-only) → `CANCELED` (red)
- `Room` - Event-scoped
- `Company` - System-level company records with a centralized `pipelineValue`, strictly avoiding data duplication.
- `IntelligenceSubscription` - Per-user subscription record; tracks email, `unsubscribeToken`, `active` flag, and selected entity IDs (attendees/companies/events)
- `IntelligenceReport` - Stores OpenClaw research reports; idempotent by `(runId, targetName)` composite unique key
- `IntelligenceEmailLog` - Audit trail of sent/skipped/failed intelligence emails with target counts per run

**Cascade behavior**: Deleting an event cascades to meetings and rooms but NOT attendees (only the join record is removed).

### Authentication & RBAC

**Provider**: Clerk with conditional auth support via `components/auth/index.tsx`. Set `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true` to disable (provides mock root user for testing).

**Roles** (`lib/constants.ts`):
- `root` - Full system access including settings and user management
- `marketing` - Write access + event management + user management; global event access
- `admin` - Write access to events and data; requires per-event authorization
- `user` - Read-only; requires per-event authorization (default for new users)

**Per-event access** (`lib/access.ts`): Admin and User roles need their userId listed in `event.authorizedUserIds`. Root and Marketing have implicit global access.

**Permission helpers** (`lib/roles.ts`):
- `canWrite()` - True for root/admin/marketing
- `canManageEvents()` - True for root/marketing

**Role initialization**: New Clerk users get `user` role via `/api/user/init`. The `RoleSynchronizer` component triggers this on first load.

**Middleware** (`middleware.ts`): Protects `/events/*`, `/dashboard/*`, `/admin/*`, `/api/*`. `/settings` requires root. `/admin/users` requires root or marketing.

### AI Chat System (`app/api/chat/route.ts`)

**Two distinct chat systems exist — do not confuse them:**

**Event-scoped AI Chat** (`/events/[id]/chat`):
- Vercel AI SDK 5.0 `streamText` with Google Gemini 2.5 Pro
- Event-scoped; tools created per-request via `createTools(eventId, slug)` in `lib/tools/`
- Multi-step tool execution (max 5 steps via `stopWhen: stepCountIs(5)`)
- 300-second timeout; history in localStorage
- **AI Tools** (`lib/tools/`): `getMeetings`, `getAttendees`, `getRooms`, `createMeeting`, `updateMeeting`, `deleteMeeting`, `getNavigationLinks`
- System prompt warns AI NOT to filter by event name (tools are already scoped). Navigation link results render as special UI cards in the frontend.

**OpenClaw Intelligence Chat** (`/intelligence`):
- WebSocket connection to `ws-proxy` → OpenClaw agent "Kenji"; system-wide, not event-scoped
- `eventId` is passed as a breadcrumb only (helps Kenji orient to context); does not scope tools
- History persisted server-side in ws-proxy per userId
- See `OPENCLAW_INTEGRATION.md` for full architecture details

### ROI Sparkle Intelligence

The ROI page (`/events/[id]/roi`) has three Gemini-powered sparkle buttons that auto-populate empty form fields:

1. **Financial Targets sparkle**: Extracts budget, expectedPipeline, and winRate from the marketing plan via `/api/events/[id]/roi/extract-roi`. Only fills empty fields.
2. **Event Targets sparkle**: Extracts meeting KPIs and engagement targets (ERTA, speaking, media/PR). Only fills empty fields.
3. **Target Companies sparkle**: Extracts 10–15 target company names; creates new Company records or links to existing ones; shows a confirmation panel listing matched vs. new companies before applying.

**Flow**: Each sparkle button first calls `generate-plan` if no marketing plan exists yet, then calls `extract-roi` to parse structured values from the plan. A confirmation panel lists which fields will be filled vs. skipped (already populated). Skipped-company counts are reported in the success message.

**Event card sparkle** (`/events` portfolio page): The sparkle icon (✦) on each event card now calls `/api/events/[id]/roi/generate-plan` directly via Gemini (no longer routes through OpenClaw). Navigation behavior:
- Plan generated successfully → navigates to `/events/{id}/roi`
- Plan already exists → navigates to `/events/{id}/roi?planWarning=1`
- Generation error → navigates to `/events/{id}/roi?planError=1`

The ROI page reads `planWarning`/`planError` query params on mount, displays transient banner messages, and clears the params via `router.replace()`.

### Filter State Persistence

**`hooks/useFilterParams.ts`**: Generic hook that syncs filter state to localStorage. Used on the events portfolio, attendees, and companies pages.

```typescript
const { filters, setFilter, setFilters, isFiltered, resetFilters } = useFilterParams('myKey', defaults)
```

- Reads defaults from localStorage on mount (lazy initializer avoids hydration race).
- Persists every state change immediately.
- `isFiltered` is `true` when any filter differs from its default — use it to conditionally render a "Clear Filters" button.
- SSR-safe: gracefully handles `localStorage` being unavailable.

### External Integrations

**Cloudflare R2** (`lib/storage.ts`): Image storage using AWS S3-compatible API. Used for attendee/company photos.

**Email + Calendar Invites** (`lib/email.ts`, `lib/calendar-sync.ts`): nodemailer sends meeting invite emails with ICS attachments generated via the `ics` package. Triggered via `/api/meetings/[id]/email` and `/api/meetings/[id]/invite`.

**Mapbox** (`lib/geocoding.ts`): Geocoding for room/venue locations. Displayed via `react-leaflet`.

**Sentry** (`instrumentation.ts`, `sentry.*.config.ts`): Error tracking on client, server, and edge runtimes.

**OpenClaw Insights** (`components/IntelligenceChat.tsx`): Market intelligence agent with two modes — real-time chat and scheduled intelligence reports. Runs as a 3-container Docker stack (see `OPENCLAW_INTEGRATION.md`):
- `ws-proxy` (Node.js, port 8080): Authenticates Clerk JWTs, exchanges them for action tokens via `POST /api/intelligence/session`, persists chat history per userId, proxies messages to OpenClaw
- `sales-recon-openclaw` (OpenClaw + Python + Crawl4AI, port 50045): Hosts agent "Kenji"; MCP tools include web search (Brave/Tavily), Crawl4AI web scraping, and event-planner DB operations via `/api/intelligence/actions`; runs scheduled cron cycles
- `event-planner` (this app): Provides target list and webhook endpoints, stores reports, dispatches emails

**Note**: The action confirmation UI (`ActionConfirmCard`) has been removed. OpenClaw write actions (create/update/cancel meeting, update ROI targets, update company) now execute without an in-app confirmation step.

**WebSocket URL**: Browser connects to `NEXT_PUBLIC_WS_URL` (ws-proxy), not directly to OpenClaw. Falls back to `ws://localhost:8080/` when env var is unset.

**Session token exchange**: ws-proxy calls `POST /api/intelligence/session` with the Clerk JWT (authenticated via `CRON_SECRET_KEY` Bearer token) to receive a signed action token. OpenClaw tools use this token when calling event-planner API endpoints.

**Cron schedule**: Tuesday and Thursday at 06:00 Central Time (`0 6 * * 2` and `0 6 * * 4`). Registered inside the OpenClaw container via `event-planner-cron.py` in `~/dev/sales-recon`.

**Memory files**: OpenClaw maintains `memory/{Company_Name}.md` and `memory/{First_Last}.md` structured with Latest / Profile / Key Decision Makers (companies only) / Archive sections.

Served at `/intelligence` (standalone). Inbound intelligence reports arrive via `/api/webhooks/intel-report`.

### API Routes

**Pattern**: RESTful with Next.js App Router
- `/api/[resource]/route.ts` - Collection (GET, POST)
- `/api/[resource]/[id]/route.ts` - Item (GET, PUT, DELETE)

**Authorization pattern**:
```typescript
import { canWrite } from '@/lib/roles'
if (!await canWrite()) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**Key endpoints not covered elsewhere**:
- `/api/meetings/check-availability` - Room conflict detection
- `/api/meetings/[id]/email` - Send meeting invite email
- `/api/meetings/[id]/invite` - Generate ICS invite
- `/api/events/[id]/roi` - ROI targets and actuals
- `/api/events/[id]/roi/generate-plan` - POST: Gemini-powered marketing plan generation (idempotent — skips if plan exists, returns `{skipped: true}`); 120s timeout; requires Gemini API key
- `/api/events/[id]/roi/extract-roi` - POST: Parses existing marketing plan via Gemini and returns structured ROI field values; returns 400 if no plan exists
- `/api/companies` - Company CRUD
- `/api/admin/system` - System admin operations (export/import/reset)
- `/api/image-proxy` - Proxies external images to avoid CORS
- `/api/attendees/autocomplete` - AI-powered attendee info lookup (actual Gemini call)
- `/api/chat/status` - Chat system status
- `/api/intelligence/subscribe` - Intelligence subscription CRUD (attendees, companies, events)
- `/api/intelligence/subscribe/attendees/[id]` - Toggle per-attendee subscription
- `/api/intelligence/subscribe/companies/[id]` - Toggle per-company subscription
- `/api/intelligence/subscribe/events/[id]` - Toggle per-event subscription
- `/api/intelligence/session` - Exchange Clerk JWT for action token (called by ws-proxy; requires `CRON_SECRET_KEY` Bearer auth)
- `/api/intelligence/targets` - Cron-triggered target list (requires `CRON_SECRET_KEY`)
- `/api/intelligence/actions` - OpenClaw tool execution endpoint; authenticated by action token; write tools require `confirmed: true` or return `requires_confirmation: true`; supports `getMeetings`, `createMeeting`, `cancelMeeting`, `updateMeeting`, `getAttendees`, `addAttendee`, `getRooms`, `getRoomAvailability`, `checkAttendeeAvailability`, `getROITargets`, `updateROITargets` (accepts `targetCompanyNames`/`targetCompanyIds` and `marketingPlan`), `updateCompany`, `getEvent`, `getNavigationLinks`, `listEvents`
- `/api/intelligence/unsubscribe` - Unsubscribe handler (used in emails)
- `/api/webhooks/intel-report` - Inbound intelligence reports from OpenClaw

**Backup**: `/api/settings/export` supports `BACKUP_SECRET_KEY` header to bypass auth.

### Pages (Navigation Structure)

Event pages are logically grouped into sub-menus: **Performance**, **Audience**, and **Logistics**.

```
/                           - Home
/events                     - Events Portfolio
/events/[id]/dashboard      - [Performance] Overview with statistics
/events/[id]/roi            - [Performance] ROI targets vs. actuals tracking
/events/[id]/reports        - [Performance] Analytics, PDF/CSV export
/events/[id]/attendees      - [Audience] Attendee management
/events/[id]/companies      - [Audience] Company shared directory
/events/[id]/new-meeting    - [Logistics] Meeting creation form
/events/[id]/calendar       - [Logistics] Drag-and-drop scheduler
/events/[id]/rooms          - [Logistics] Room management
/events/[id]/chat           - AI assistant with persistent history
/events/[id]/settings       - Event-level settings
/admin/users                - User role management
/admin/system               - System administration
/intelligence               - OpenClaw Insights AI (standalone)
/intelligence/subscribe     - Manage intelligence subscriptions
/manual                     - User manual
/settings                   - System settings (root only)
```

### PDF Generation

`jspdf` + `jspdf-autotable` for briefing books. `lib/briefing-book.ts` and `lib/calendar-pdf.ts` handle generation. Export endpoints: `/api/rooms/[id]/briefing`, `/api/attendees/[id]/briefing`.

Markdown-to-PDF conversion available via `lib/markdown-to-pdf.ts`.

## Environment Variables

```bash
# Database
DATABASE_URL / POSTGRES_PRISMA_URL

# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_DISABLE_CLERK_AUTH=true   # Disable auth for testing

# Cloudflare R2 (image storage)
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL

# Email (nodemailer)
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM

# Other
BACKUP_SECRET_KEY          # Bypass auth for export endpoint
MAPBOX_ACCESS_TOKEN        # Geocoding/maps
SENTRY_AUTH_TOKEN          # Error tracking
NEXT_PUBLIC_APP_URL        # Public app URL used in intelligence email unsubscribe links (e.g. https://www.aieventplanner.work)
NEXT_PUBLIC_WS_URL         # WebSocket URL for OpenClaw Insights (e.g. ws://localhost:8080/)
NEXT_PUBLIC_LI_ARTICLE_API_URL  # URL of the li-article-agent API server (default: http://localhost:8000)
CRON_SECRET_KEY            # Bearer token for machine-to-machine intelligence API routes (/api/intelligence/targets, /api/webhooks/intel-report, /api/intelligence/session)
```

**Gemini API key** is stored in the `SystemSettings` DB table, not as an env var.

## Common Gotchas

1. **Attendee deletion**: Deleting an event removes the join record but not the attendee itself.
2. **Slug uniqueness**: Slug generation adds a random suffix on collision.
3. **Read-only mode**: Events with status `OCCURRED` are locked in API and UI.
4. **Meeting sequence**: Increment `sequence` on every meeting update so calendar clients recognize the updated invite.
5. **AI chat scope**: Switching events starts a new conversation context.
6. **`lib/enrichment.ts`**: This is a mock service (returns dummy data). The real enrichment is done by the Gemini call in `/api/attendees/autocomplete`.
7. **Role init**: New Clerk users have no role until `RoleSynchronizer` runs `/api/user/init`.
8. **ROI sparkle idempotency**: `generate-plan` returns `{skipped: true}` (not an error) if a marketing plan already exists. The event card sparkle uses this to show a `planWarning` banner instead of regenerating.
9. **Import/export preserves `marketingPlan`**: Both V5 and V4 import paths include `marketingPlan` in the ROI upsert. Ensure any new ROI fields are added to both import handlers.
10. **Event settings user list**: Uses server-side pagination (`/api/admin/users?page=X&limit=10&search=term`) with 500ms debounced search — not a single full fetch. The first page may not contain the user you expect; use search.
