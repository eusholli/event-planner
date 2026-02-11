# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Event Planner is a Next.js 16 application for managing multi-event conferences with attendees, meetings, and schedules. Built with Prisma (PostgreSQL), Clerk authentication, Vercel AI SDK 5.0, and Google Gemini 2.5 Pro.

## Development Commands

### Running the Application
```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Build for production (includes DB check and migration)
npm start                # Start production server
npm run lint             # Run ESLint
```

### Database Management
```bash
npx prisma studio        # Open Prisma Studio GUI
npx prisma migrate dev   # Create and apply migration
npx prisma generate      # Regenerate Prisma Client (auto-runs on postinstall)
npm run db:main          # Switch to main database (.env.main)
npm run db:multi         # Switch to multi-event database (.env.multi)
```

**Important**: The database switching mechanism (`npm run db:main/multi`) copies the specified `.env.*` file to `.env` and regenerates the Prisma client. This is used to toggle between different database environments during development.

## Architecture

### Multi-Event System

The application supports multiple independent events, each with isolated:
- Attendees (many-to-many with Events)
- Meetings (belongs to Event, cascade delete)
- Rooms (belongs to Event, cascade delete)

Events are accessed via `/events/[id]/*` routes where `[id]` can be either:
- UUID (e.g., `clyq8x7890000...`)
- Slug (e.g., `mwc-2025`)

**Key Pattern**: All event-scoped API routes and pages resolve both UUID and slug to the canonical UUID for database operations. This dual-access pattern is critical for user-friendly URLs and event sharing.

### Database Layer

**Prisma Configuration** (`lib/prisma.ts`):
- Uses `@prisma/adapter-pg` for connection pooling
- Automatically detects local vs. remote databases
- Removes `sslmode` parameter for Vercel Postgres compatibility
- Singleton pattern with global caching in development

**Key Models**:
- `SystemSettings` - Global settings (Gemini API key, default types/tags)
- `Event` - Top-level event container with slug-based routing
- `Attendee` - System-level entities that can be associated with multiple events
- `Meeting` - Event-scoped with MeetingStatus enum (PIPELINE/CONFIRMED/OCCURRED/CANCELED)
- `Room` - Event-scoped venue spaces

**Critical**: Attendees are system-level (unique email constraint) and shared across events via many-to-many relationship. When deleting an event, attendees are NOT deleted (only the relationship is removed).

### Authentication & RBAC

**Provider**: Clerk with conditional auth support
- Wrapper at `components/auth/index.tsx` checks `NEXT_PUBLIC_DISABLE_CLERK_AUTH`
- When auth is disabled, provides mock user with root role (useful for testing)

**Roles** (defined in `lib/constants.ts`):
- `root` - Full system access (settings, user management)
- `admin` - Write access to events and data
- `marketing` - Write access + event management + user management
- `user` - Read-only access (default for new users)

**Role Assignment**:
- New users auto-assigned `user` role via `/api/user/init` endpoint
- `RoleSynchronizer` component triggers initialization on first load
- Roles stored in Clerk `publicMetadata.role`

**Middleware Protection** (`middleware.ts`):
- All `/events/*`, `/dashboard/*`, `/admin/*`, `/api/*` routes protected
- `/settings` requires root role
- `/admin/users` requires root or marketing role
- Backup key bypass available for `/api/settings/export` (using `BACKUP_SECRET_KEY` header)

**Permission Helpers** (`lib/roles.ts`):
- `checkRole(role)` - Check if current user has specific role
- `canWrite()` - True for root/admin/marketing
- `canManageEvents()` - True for root/marketing

### AI Chat System

**Architecture** (`app/api/chat/route.ts`):
- Uses Vercel AI SDK 5.0 `streamText` with Google Gemini 2.5 Pro
- Event-scoped chat (each event has isolated conversation context)
- Tool calling with multi-step execution (max 5 steps via `stopWhen: stepCountIs(5)`)
- 300-second timeout for complex operations

**AI Tools** (`lib/tools/`):
- `getMeetings` - Search/list meetings with filtering
- `getAttendees` - Search/list attendees
- `getRooms` - Search/list rooms
- `createMeeting`, `updateMeeting`, `deleteMeeting` - Meeting CRUD
- `getNavigationLinks` - Generate UI navigation cards

**Critical Pattern**: Tools are created per-request with `createTools(eventId, slug)` to scope operations to the current event. The system prompt explicitly warns the AI NOT to search using the event name itself, as tools are already scoped.

**Tool Outputs**: The AI is instructed to process tool results silently and provide final answers directly (no status messages like "processing..."). Navigation links are rendered as special UI cards by the frontend.

### API Route Structure

**Pattern**: RESTful with Next.js App Router conventions
- `/api/[resource]/route.ts` - Collection endpoints (GET, POST)
- `/api/[resource]/[id]/route.ts` - Item endpoints (GET, PUT, DELETE)
- `/api/[resource]/[id]/[action]/route.ts` - Action endpoints (POST)

**Authorization Pattern**:
```typescript
import { canWrite } from '@/lib/roles'
if (!await canWrite()) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**Key Endpoints**:
- `/api/events` - Event CRUD with slug generation
- `/api/events/[id]/import` - Import event data (JSON/CSV)
- `/api/events/[id]/export` - Export event data with backup key support
- `/api/attendees/autocomplete` - AI-powered attendee info lookup (Google Gemini)
- `/api/chat` - AI chat streaming with tool calling
- `/api/admin/users` - User role management (root/marketing only)

### Frontend Architecture

**Pages**: Next.js App Router with nested event routes
- `/events` - Event list and creation
- `/events/[id]/dashboard` - Event overview with statistics
- `/events/[id]/attendees` - Attendee management
- `/events/[id]/calendar` - Drag-and-drop meeting scheduler (react-big-calendar)
- `/events/[id]/chat` - AI assistant with persistent history
- `/events/[id]/reports` - Analytics and PDF/CSV export
- `/events/[id]/rooms` - Room management

**Key Components**:
- `Navigation.tsx` - Role-based nav with SignIn/UserButton
- `RoleSynchronizer.tsx` - Auto role initialization for new users
- Drag-and-drop scheduler uses `react-dnd` + `react-big-calendar`

**State Management**: No global state library. Uses React Server Components with client components for interactivity. Event context passed via URL params.

### PDF Generation

**Libraries**: `jspdf` + `jspdf-autotable`
- Briefing books generated server-side for Rooms and Attendees
- Export endpoints: `/api/rooms/[id]/briefing`, `/api/attendees/[id]/briefing`
- PDF includes meeting schedules, attendee details, company info

### Data Management Features

**Import/Export**:
- System-level: `/api/settings/export` (all data), `/api/settings/import`
- Event-level: `/api/events/[id]/export`, `/api/events/[id]/import`
- Formats: JSON (full structure), CSV (meetings only)

**Factory Reset**:
- `/api/settings/delete-data` - Delete all data (requires confirmation)
- `/api/events/[id]/reset` - Delete event-specific data
- Auto-backup before destructive operations

**Read-Only Mode**: Events with status `OCCURRED` are locked to prevent accidental changes (enforced in API and UI).

## Important Patterns

### Event Resolution
Always resolve slug to UUID early in API routes:
```typescript
const event = await prisma.event.findFirst({
  where: { OR: [{ id: eventId }, { slug: eventId }] }
})
const resolvedEventId = event.id
```

### Attendee Autocomplete
The `/api/attendees/autocomplete` endpoint uses Google Gemini to fetch professional details (title, company, bio, LinkedIn) from the web. Results are returned as structured JSON for form population.

### Environment Variables
- `DATABASE_URL` / `POSTGRES_PRISMA_URL` - Database connection
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` - Clerk auth
- `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true` - Disable auth for testing
- `BACKUP_SECRET_KEY` - Bypass auth for export endpoint
- Gemini API key stored in SystemSettings table (not env var)

### Testing
Uses Playwright for E2E testing (configured but test suite not shown).

## Common Gotchas

1. **Attendee Deletion**: Attendees are system-level. Deleting an event removes the relationship but not the attendee record itself.
2. **Slug Uniqueness**: Event slugs must be unique. Slug generation uses name + random suffix if collision occurs.
3. **Cascade Deletes**: Deleting an event cascades to meetings and rooms but NOT attendees.
4. **AI Chat Scope**: Chat is event-scoped. Switching events starts a new conversation context.
5. **Role Initialization**: New Clerk users don't have roles by default. The RoleSynchronizer component must run to assign the default `user` role.
6. **Database Adapter**: The app uses `@prisma/adapter-pg` (not default client) for better connection pooling on Vercel.
7. **Build Process**: `npm run build` runs DB check script before building to ensure database connectivity.
