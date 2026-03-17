# Directory Structure

## Top-Level Layout

```
event-planner/
├── app/                    # Next.js App Router pages and API routes
├── components/             # Shared React components
├── lib/                    # Server-side utilities, services, and helpers
├── prisma/                 # Database schema and migrations
├── public/                 # Static assets
├── docs/                   # Documentation files
├── .planning/              # GSD planning artifacts
├── .env                    # Active environment (copied from .env.main or .env.multi)
├── .env.main               # Main branch database config
├── .env.multi              # Multi-event branch database config
├── middleware.ts           # Clerk auth middleware
├── next.config.ts          # Next.js configuration
├── tailwind.config.ts      # Tailwind CSS v4 config
├── postcss.config.mjs      # PostCSS config
├── tsconfig.json           # TypeScript config
├── eslint.config.mjs       # ESLint config
├── sentry.client.config.ts # Sentry client runtime
├── sentry.server.config.ts # Sentry server runtime
├── sentry.edge.config.ts   # Sentry edge runtime
└── instrumentation.ts      # Sentry instrumentation hook
```

## `app/` Directory (Next.js App Router)

```
app/
├── layout.tsx              # Root layout (Clerk provider, RoleSynchronizer)
├── page.tsx                # Home page (/)
├── globals.css             # Global styles (Tailwind imports)
├── api/                    # API routes
│   ├── attendees/
│   │   ├── route.ts        # GET/POST /api/attendees
│   │   ├── [id]/route.ts   # GET/PUT/DELETE /api/attendees/[id]
│   │   ├── [id]/briefing/route.ts
│   │   └── autocomplete/route.ts
│   ├── chat/
│   │   ├── route.ts        # POST /api/chat (Vercel AI SDK streamText)
│   │   └── status/route.ts
│   ├── companies/
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── events/
│   │   ├── route.ts        # GET/POST /api/events
│   │   └── [id]/
│   │       ├── route.ts
│   │       ├── roi/route.ts
│   │       └── settings/route.ts
│   ├── image-proxy/route.ts
│   ├── intelligence/
│   │   ├── actions/route.ts    # OpenClaw tool execution
│   │   ├── session/route.ts    # JWT → action token exchange
│   │   ├── subscribe/
│   │   │   ├── route.ts
│   │   │   ├── attendees/[id]/route.ts
│   │   │   ├── companies/[id]/route.ts
│   │   │   └── events/[id]/route.ts
│   │   ├── targets/route.ts
│   │   └── unsubscribe/route.ts
│   ├── meetings/
│   │   ├── route.ts
│   │   ├── check-availability/route.ts
│   │   └── [id]/
│   │       ├── route.ts
│   │       ├── email/route.ts
│   │       └── invite/route.ts
│   ├── rooms/
│   │   ├── route.ts
│   │   └── [id]/
│   │       ├── route.ts
│   │       └── briefing/route.ts
│   ├── settings/
│   │   ├── route.ts
│   │   └── export/route.ts
│   ├── user/
│   │   ├── init/route.ts   # Assigns default role to new Clerk users
│   │   └── [id]/route.ts
│   ├── admin/
│   │   ├── system/route.ts
│   │   └── users/route.ts
│   └── webhooks/
│       └── intel-report/route.ts
├── events/
│   └── [id]/               # Event-scoped pages (id = UUID or slug)
│       ├── attendees/page.tsx
│       ├── calendar/page.tsx
│       ├── chat/page.tsx
│       ├── companies/page.tsx
│       ├── dashboard/page.tsx
│       ├── new-meeting/page.tsx
│       ├── reports/page.tsx
│       ├── roi/page.tsx
│       ├── rooms/page.tsx
│       └── settings/page.tsx
├── intelligence/
│   ├── page.tsx            # OpenClaw Insights chat (/intelligence)
│   └── subscribe/page.tsx  # Intelligence subscription management
├── admin/
│   ├── users/page.tsx
│   └── system/page.tsx
├── dashboard/page.tsx      # Redirect/root dashboard
├── settings/page.tsx       # System settings (root only)
└── manual/page.tsx         # User manual
```

## `components/` Directory

```
components/
├── auth/
│   └── index.tsx           # Conditional auth wrapper (Clerk or mock)
├── ActionConfirmCard.tsx   # OpenClaw write-action confirmation UI
├── AttendeeModal.tsx
├── CompanyModal.tsx
├── EventCard.tsx           # Event list card with sparkle ROI button
├── EventNav.tsx            # Sub-nav (Performance/Audience/Logistics)
├── IntelligenceChat.tsx    # OpenClaw WebSocket chat UI
├── MeetingCard.tsx
├── MeetingDetailsModal.tsx
├── MeetingModal.tsx
├── RoleSynchronizer.tsx    # Triggers /api/user/init on first load
├── RoomModal.tsx
└── ui/                     # Shared UI primitives (buttons, inputs, etc.)
```

## `lib/` Directory

```
lib/
├── prisma.ts               # PrismaClient singleton with pg adapter
├── access.ts               # Per-event access control helpers
├── roles.ts                # canWrite(), canManageEvents() etc.
├── role-utils.ts           # Client-side role utilities
├── constants.ts            # Role constants, enums
├── tools/                  # AI tool definitions (event-scoped chat)
│   ├── index.ts            # createTools(eventId, slug) factory
│   ├── getMeetings.ts
│   ├── getAttendees.ts
│   ├── getRooms.ts
│   ├── createMeeting.ts
│   ├── updateMeeting.ts
│   ├── deleteMeeting.ts
│   └── getNavigationLinks.ts
├── briefing-book.ts        # jsPDF briefing book generation
├── calendar-pdf.ts         # Calendar view PDF export
├── calendar-sync.ts        # ICS calendar invite generation
├── email.ts                # nodemailer email sending
├── enrichment.ts           # MOCK enrichment service (returns dummy data)
├── geocoding.ts            # Mapbox geocoding
├── markdown-to-pdf.ts      # Markdown → PDF conversion
└── storage.ts              # Cloudflare R2 image storage (S3-compatible)
```

## `prisma/` Directory

```
prisma/
├── schema.prisma           # Database schema (V2 multi-event)
└── migrations/             # Applied migration history
    └── [timestamp]_[name]/ # Each migration folder
        └── migration.sql
```

## Key File Locations

| Purpose | Path |
|---------|------|
| DB client | `lib/prisma.ts` |
| Auth middleware | `middleware.ts` |
| Role constants | `lib/constants.ts` |
| Access control | `lib/access.ts`, `lib/roles.ts` |
| AI chat route | `app/api/chat/route.ts` |
| AI tools factory | `lib/tools/index.ts` |
| OpenClaw actions | `app/api/intelligence/actions/route.ts` |
| Event resolution | `app/api/events/[id]/route.ts` (slug → UUID pattern) |
| Root layout | `app/layout.tsx` |
| Prisma schema | `prisma/schema.prisma` |

## Naming Conventions

### Files
- **Pages**: `app/[path]/page.tsx` — always `page.tsx`
- **API routes**: `app/api/[resource]/route.ts` — always `route.ts`
- **Components**: PascalCase (`MeetingModal.tsx`, `EventCard.tsx`)
- **Lib utilities**: camelCase (`briefing-book.ts`, `calendar-sync.ts`)
- **Types**: Defined inline or via Prisma-generated types

### Directories
- **API routes**: kebab-case (`check-availability`, `intel-report`)
- **App pages**: kebab-case (`new-meeting`, `intelligence`)
- **Dynamic segments**: `[id]` for UUIDs/slugs

### Code
- **Components**: PascalCase functions (`export default function EventCard`)
- **Hooks/utilities**: camelCase (`canWrite`, `createTools`)
- **Constants**: SCREAMING_SNAKE_CASE for env vars, camelCase for TS constants
- **DB models**: PascalCase (`Meeting`, `Attendee`, `SystemSettings`)
- **DB fields**: camelCase (`authorizedUserIds`, `companyId`)

## Where to Add New Code

| Task | Location |
|------|----------|
| New event page | `app/events/[id]/[feature]/page.tsx` |
| New API endpoint | `app/api/[resource]/route.ts` |
| New shared component | `components/[ComponentName].tsx` |
| New AI tool (event chat) | `lib/tools/[toolName].ts` + register in `lib/tools/index.ts` |
| New intelligence action | Add to `app/api/intelligence/actions/route.ts` |
| New DB model | `prisma/schema.prisma` + `npx prisma migrate dev --name [name]` |
| New utility | `lib/[utility-name].ts` |
