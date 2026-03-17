# Architecture

**Analysis Date:** 2026-03-17

## Pattern Overview

**Overall:** Multi-layer Next.js 16 application with event-scoped API routes, real-time AI chat system, and role-based access control (RBAC).

**Key Characteristics:**
- Event-centric data model with UUID/slug resolution for flexible routing
- Dual AI systems: event-scoped streaming chat (Gemini 2.5 Flash) and external OpenClaw intelligence agent
- Per-event authorization via `event.authorizedUserIds` for admin/user roles
- Clerk-based authentication with metadata-driven role assignment
- Vercel AI SDK 5.0 for multi-step tool execution (max 5 steps)
- Prisma ORM with connection pooling via `@prisma/adapter-pg`

## Layers

**Presentation Layer (Components & Pages):**
- Purpose: UI components and page routes in Next.js App Router
- Location: `app/` (pages) and `components/` (reusable components)
- Contains: React components, page layouts, forms (MeetingModal, AddAttendeeForm), chat interface
- Depends on: API routes, auth context, UI state management
- Used by: Browser clients via HTTP

**API Layer (Route Handlers):**
- Purpose: RESTful endpoints following Next.js App Router pattern
- Location: `app/api/`
- Contains: Request/response handlers with role and event-scoped authorization
- Depends on: Database layer (Prisma), auth middleware, utilities
- Used by: Frontend pages, external systems (webhooks), AI tools

**Data Access Layer (Prisma & Database):**
- Purpose: ORM abstraction over PostgreSQL with connection pooling
- Location: `lib/prisma.ts` (singleton client), `prisma/schema.prisma` (schema)
- Contains: Prisma client initialization, schema definitions (Event, Meeting, Attendee, Company, etc.)
- Depends on: PostgreSQL database
- Used by: All API routes and server-side operations

**Authorization Layer:**
- Purpose: Role-based access control and per-event access verification
- Location: `lib/roles.ts`, `lib/role-utils.ts`, `lib/access.ts`, `lib/with-auth.ts`
- Contains: Role hierarchy (root > marketing > admin > user), event access checks, auth context
- Depends on: Clerk authentication, database (for event.authorizedUserIds)
- Used by: API route handlers, components (role-based UI rendering)

**AI Tools & Integrations:**
- Purpose: Tool definitions for Gemini API, OpenClaw actions, intelligence email dispatch
- Location: `lib/tools/` (Gemini tools), `lib/intelligence-email.ts`, external integrations
- Contains: Meeting/attendee/room/navigation tools, email delivery, OpenClaw session handling
- Depends on: Database, Gemini API, nodemailer, OpenClaw ws-proxy
- Used by: Chat route, intelligence chat WebSocket

**Utilities & Domain Logic:**
- Purpose: Cross-cutting concerns and business logic
- Location: `lib/` miscellaneous modules
- Contains: Email/calendar sync (`lib/email.ts`, `lib/calendar-sync.ts`), PDF generation (`lib/briefing-book.ts`), storage (`lib/storage.ts`), geocoding, action tokens
- Depends on: External services (Cloudflare R2, Mapbox, SMTP), Prisma
- Used by: API routes, components, cron handlers

## Data Flow

**Event Page Navigation:**

1. User navigates to `/events/[id]/dashboard` (or any event subpage)
2. `app/events/[id]/layout.tsx` resolves `[id]` (slug or UUID) via `resolveEventId()`
3. Layout fetches event and checks user access via `hasEventAccess()` (considers role and `event.authorizedUserIds`)
4. If no direct access, checks `event.password` for public password protection
5. Layout renders children with event context (name, breadcrumb)
6. Sub-page (e.g., dashboard) fetches data via `/api/events/[id]/*` routes

**Event-Scoped AI Chat:**

1. User opens `/events/[id]/chat` page
2. Frontend stores messages in localStorage
3. User submits message → POST `/api/chat` with `eventId` parameter
4. Handler resolves event ID, checks access, fetches Gemini API key from `SystemSettings`
5. Creates event-scoped tools via `createTools(resolvedEventId, resolvedSlug)` (getMeetings, createMeeting, etc. all scoped)
6. `streamText()` executes with max 5 steps, AI uses tools to read/write event data
7. Response streams back as Server-Sent Events (SSE) to frontend
8. Frontend renders markdown + tool results as special UI cards (navigation links auto-render)

**OpenClaw Intelligence Chat:**

1. User clicks sparkle icon on event card → async pre-fetch of current ROI values
2. Button stores auto-query prompt in `sessionStorage.intelligenceAutoQuery`
3. Navigates to `/intelligence?eventId=<slug>`
4. Frontend WebSocket connects to `NEXT_PUBLIC_WS_URL` (ws-proxy, not direct to OpenClaw)
5. ws-proxy authenticates via Clerk JWT → `POST /api/intelligence/session` → receives action token
6. Session token persists per userId in ws-proxy; ai agent uses it for subsequent calls
7. OpenClaw agent "Kenji" processes query, proposes write actions (create/update meetings, update ROI, etc.)
8. ws-proxy sends `pending_action` WebSocket frame back to client with action details
9. User clicks Confirm in ActionConfirmCard → sends confirmation frame to ws-proxy
10. ws-proxy calls `/api/intelligence/actions` with `confirmed: true` → action executes
11. Response streams back; frontend renders success/error

**Event Creation:**

1. User clicks "New Event" button on `/events` page
2. Frontend POST `/api/events` with empty `name`
3. Handler generates draft slug with random suffix, fetches system defaults
4. Event created with `status: PIPELINE`, empty attendee list
5. Frontend navigates to `/events/[slug]/settings`
6. User fills event details (name, dates, region) and saves

**Meeting Workflow:**

1. User navigates to `/events/[id]/new-meeting` page
2. Form shows event attendees (from join table), rooms, date picker
3. User selects attendees, room, time, title → POST `/api/meetings`
4. Handler creates meeting, optionally sends invite email + ICS via `/api/meetings/[id]/invite` and `/api/meetings/[id]/email`
5. Meeting sequence auto-incremented on every update (for calendar client versioning)
6. Meeting status progresses: PIPELINE → CONFIRMED → OCCURRED → CANCELED

**State Management:**

- Frontend: React local state + localStorage for chat history, sessionStorage for temp values (auto-query)
- Backend: Prisma models as source of truth, event-scoped SQL queries
- Real-time: WebSocket for OpenClaw chat; SSE for Gemini chat streams
- Authorization: Checked at handler entry via `withAuth()` HOF decorator

## Key Abstractions

**Event Resolution:**

- Purpose: Handle both UUID and slug routing transparently
- Examples: `resolveEventId()` in `lib/events.ts`, used in layout and API routes
- Pattern: `findFirst({ OR: [{ id: rawId }, { slug: rawId }] })`
- Benefit: Allows human-friendly slugs while maintaining database performance via UUID

**Tool Execution:**

- Purpose: Encapsulate Gemini tool definitions with permission checks
- Examples: `lib/tools/meetings.ts`, `lib/tools/attendees.ts`, `lib/tools/rooms.ts`
- Pattern: Each tool is a Zod schema + execute function; permission checks in execute
- Benefit: Separates tool logic from chat orchestration; easy to add new tools

**Authorization Wrapper:**

- Purpose: Unified auth/role/event-access checking for route handlers
- Examples: `withAuth()` HOF in `lib/with-auth.ts`
- Pattern: Decorator that resolves identity, checks capabilities, resolves event, injects authCtx
- Benefit: Single point of control; eliminates repetitive auth boilerplate in 50+ route handlers

**Intelligence Action Confirmation:**

- Purpose: Safeguard AI-driven writes with explicit user confirmation
- Examples: `ActionConfirmCard` component, OpenClaw action protocol in ws-proxy
- Pattern: Pending action sent to client as WebSocket frame; user confirms before execution
- Benefit: Prevents accidental mass updates; maintains audit trail

**Slug Uniqueness & Draft Naming:**

- Purpose: Auto-generate slugs with collision avoidance
- Pattern: On create, if slug provided check uniqueness; if not, generate `draft-event-{timestamp}-{randomSuffix}`
- Benefit: User can customize slug later; prevents conflicts during rapid creation

## Entry Points

**Web Application:**

- Location: `app/layout.tsx`
- Triggers: User loads https://app.example.com/
- Responsibilities: Wraps app in ClerkProvider, renders root RoleSynchronizer (initializes new users), renders Navigation sidebar, renders page children

**Event-Scoped Pages:**

- Location: `app/events/[id]/layout.tsx`
- Triggers: User navigates to `/events/[id]/*`
- Responsibilities: Resolves event UUID/slug, checks access, renders PasswordGate if needed, sets breadcrumb

**Event-Scoped API:**

- Location: `app/api/events/[id]/route.ts` (and subroutes like `/api/events/[id]/roi`)
- Triggers: Fetch calls from frontend or tools
- Responsibilities: Resolve event, check auth, execute business logic, return JSON

**Event-Scoped Chat:**

- Location: `app/api/chat/route.ts`
- Triggers: POST with `eventId` parameter
- Responsibilities: Resolve event, check access, fetch Gemini key, create tools, stream responses

**Intelligence WebSocket:**

- Location: ws-proxy (external container), bridge via `POST /api/intelligence/session`
- Triggers: Browser `WebSocket(NEXT_PUBLIC_WS_URL)` connection
- Responsibilities: Authenticate JWT, issue action token, proxy OpenClaw messages, handle confirmation protocol

**Intelligence Report Webhook:**

- Location: `app/api/webhooks/intel-report`
- Triggers: OpenClaw cron sends POST after running intelligence cycle
- Responsibilities: Store reports in DB, dispatch emails via IntelligenceEmailLog

**Admin/Settings:**

- Location: `app/admin/*`, `app/settings`, `/api/admin/*`, `/api/settings/*`
- Triggers: Root user only (via middleware redirect)
- Responsibilities: User role management, system settings (Gemini key, defaults), data export/import/reset

## Error Handling

**Strategy:** Defensive with granular error responses; Sentry for production observability.

**Patterns:**

- **Database errors:** Catch, log, return `{ error: 'Failed to [action]' }` 500 response
- **Auth failures:** Return 401 (Unauthorized) if missing token; 403 (Forbidden) if role/access denied
- **Validation errors:** Return 400 (Bad Request) with field-level details (e.g., slug already exists)
- **Not found:** Return 404 if resource doesn't exist
- **Tool permission denial:** Return string message to AI ("Permission Denied: You cannot..."); AI re-prompts user
- **Stream errors:** Catch in `streamText()` onError callback, log to Sentry, stream error message to client
- **Chat read-only:** If event status is OCCURRED, API returns 403; frontend disables write UI

**Special Cases:**

- Event password validation happens in layout (PasswordGate), not API (prevents brute-force API attacks)
- Meeting sequence mismatch: Old ICS versions ignored by clients if sequence is older
- Attendee deletion: Does NOT cascade; only join record removed (attendee record kept for system-wide reuse)

## Cross-Cutting Concerns

**Logging:** Console.error/warn for development; Sentry for production errors. No structured logging library.

**Validation:** Zod schemas in tool definitions; basic runtime checks in route handlers (e.g., `if (!eventId) return 400`).

**Authentication:** Clerk JWT in Authorization header (default); mocked as `mock-root-user` if `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true`.

**Authorization:**

- Global roles (root, marketing) checked once per request; have implicit event access
- Per-event roles (admin, user) require `userId` in `event.authorizedUserIds`
- No API endpoint enforces event access by default; must opt-in with `withAuth({ requireEventAccess: true })`

**Caching:**

- Development: Prisma client cached in global for hot reload
- Production: Singleton pattern; no distributed caching (rely on database connection pooling)
- Frontend: localStorage for chat history; no service worker / React Query

**Rate Limiting:** Not implemented; assumed handled by CDN/load balancer.

**CORS:** Not explicitly configured; Next.js handles same-origin by default.

**Database Transactions:** Not used; all operations are single-write or read-modify-write (no multi-step atomicity).

---

*Architecture analysis: 2026-03-17*
