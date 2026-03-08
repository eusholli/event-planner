# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Event Planner is a Next.js 16 application for managing multi-event conferences with attendees, meetings, and schedules. Built with Prisma (PostgreSQL), Clerk authentication, Vercel AI SDK 5.0, and Google Gemini 2.5 Pro. Requires Node.js >=24.0.0.

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
- `Event` - Top-level container with slug routing, `authorizedUserIds` for per-event access, ROI targets
- `Attendee` - System-level with unique email. Links to a `Company` relation via `companyId`. Shared across events via many-to-many
- `Meeting` - Event-scoped; `MeetingStatus` enum: `PIPELINE/CONFIRMED/OCCURRED/CANCELED`; has `sequence` field incremented on updates for calendar invite versioning
- `Room` - Event-scoped
- `Company` - System-level company records with a centralized `pipelineValue`, strictly avoiding data duplication.

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

- Vercel AI SDK 5.0 `streamText` with Google Gemini 2.5 Pro
- Event-scoped; tools created per-request via `createTools(eventId, slug)` in `lib/tools/`
- Multi-step tool execution (max 5 steps via `stopWhen: stepCountIs(5)`)
- 300-second timeout

**AI Tools** (`lib/tools/`): `getMeetings`, `getAttendees`, `getRooms`, `createMeeting`, `updateMeeting`, `deleteMeeting`, `getNavigationLinks`

**Critical**: System prompt warns AI NOT to filter by event name (tools are already scoped). Navigation link results render as special UI cards in the frontend.

### External Integrations

**Cloudflare R2** (`lib/storage.ts`): Image storage using AWS S3-compatible API. Used for attendee/company photos.

**Email + Calendar Invites** (`lib/email.ts`, `lib/calendar-sync.ts`): nodemailer sends meeting invite emails with ICS attachments generated via the `ics` package. Triggered via `/api/meetings/[id]/email` and `/api/meetings/[id]/invite`.

**Mapbox** (`lib/geocoding.ts`): Geocoding for room/venue locations. Displayed via `react-leaflet`.

**Sentry** (`instrumentation.ts`, `sentry.*.config.ts`): Error tracking on client, server, and edge runtimes.

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
- `/api/companies` - Company CRUD
- `/api/admin/system` - System admin operations (export/import/reset)
- `/api/image-proxy` - Proxies external images to avoid CORS
- `/api/attendees/autocomplete` - AI-powered attendee info lookup (actual Gemini call)
- `/api/chat/status` - Chat system status

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
/intelligence               - AI intelligence features
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
