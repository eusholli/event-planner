# External Integrations

**Analysis Date:** 2026-03-17

## APIs & External Services

**Google Gemini AI:**
- Used for event-scoped AI chat and attendee autocomplete
  - SDK: `@ai-sdk/google` 2.0.0 (via Vercel AI SDK)
  - Direct SDK: `@google/generative-ai` 0.24.1
  - Model: Google Gemini 2.5 Pro
  - API Key: Stored in `SystemSettings.geminiApiKey` (database), NOT env var
  - Access: Event-scoped chat at `/events/[id]/chat` route
  - Implementation: `app/api/chat/route.ts` using `streamText` with multi-step tool execution (max 5 steps, 300s timeout)

**OpenClaw Insights (AI Agent):**
- Market intelligence agent "Kenji" for research and business operations
  - WebSocket connection: Browser → `NEXT_PUBLIC_WS_URL` (ws-proxy) → OpenClaw
  - ws-proxy: Node.js service on port 8080, authenticates Clerk JWTs, exchanges for action tokens
  - System-wide integration (not event-scoped; eventId passed as breadcrumb only)
  - Features: Real-time chat, scheduled cron intelligence reports (Tuesday/Thursday 06:00 Central Time)
  - MCP Tools: Web search (Brave/Tavily), Crawl4AI web scraping, event-planner DB operations
  - Action confirmation protocol: Kenji proposes writes → ws-proxy sends `pending_action` WebSocket frame → UI renders ActionConfirmCard → user confirms before execution
  - Implementation: `components/IntelligenceChat.tsx` (WebSocket handler, chat UI, action confirmation)
  - Session flow: Browser sends Clerk JWT to `/api/intelligence/session` (auth: `CRON_SECRET_KEY` Bearer token) → receives signed action token → OpenClaw tools use token for API calls
  - Endpoints for AI actions: `/api/intelligence/actions` (tool execution), `/api/intelligence/targets` (cron target list), `/api/webhooks/intel-report` (report ingestion)

**Mapbox Geocoding:**
- Geocoding for room and venue locations
  - SDK: `@mapbox/mapbox-sdk` 0.16.2
  - Auth: `MAPBOX_ACCESS_TOKEN` env var
  - Implementation: `lib/geocoding.ts` with `geocodeAddress()` function
  - Returns latitude/longitude for address strings
  - Used in room/venue management and map display via `react-leaflet`

## Data Storage

**Databases:**
- PostgreSQL (production and local)
  - Connection: `POSTGRES_PRISMA_URL` env var
  - ORM: Prisma 7.4.0
  - Adapter: `@prisma/adapter-pg` 7.4.0 (native connection pooling)
  - Driver: `pg` 8.17.2
  - SSL handling: Auto-configured (local: no SSL; remote: rejectUnauthorized=false)
  - Initialization: Singleton pattern with global caching in development (`lib/prisma.ts`)
  - Schema location: `prisma/schema.prisma`
  - Migrations: `prisma/migrations/` with automated deployment

**File Storage:**
- Cloudflare R2 (S3-compatible object storage)
  - SDK: `@aws-sdk/client-s3` 3.956.0 (configured for R2 endpoint)
  - Auth: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` env vars
  - Public URL: `R2_PUBLIC_URL` env var (base URL for public access)
  - Endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  - Use case: Attendee and company photo storage
  - Implementation: `lib/storage.ts` with `uploadImageToR2()`, `deleteImageFromR2()`, `fetchAndUploadImageToR2()`

**Caching:**
- Not detected (Redis/Memcached not in stack; in-memory caching only via Prisma client singleton)

## Authentication & Identity

**Auth Provider:**
- Clerk (`@clerk/nextjs` 6.36.10)
  - Publishable Key: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (browser-accessible)
  - Secret Key: `CLERK_SECRET_KEY` (server-only)
  - User metadata: `publicMetadata.role` stores user role (root/marketing/admin/user)
  - Implementation: Conditional auth wrapper in `components/auth/index.tsx`
  - Mock support: `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true` provides mock root user for testing
  - New user initialization: `/api/user/init` assigns default `user` role; triggered by `RoleSynchronizer` component on first load
  - JWT verification: `verifyToken()` from Clerk backend SDK (used in `/api/intelligence/session`)

**Role-Based Access Control (RBAC):**
- Four roles defined in `lib/constants.ts`:
  - `root` - Full system access (settings, user management)
  - `marketing` - Write access, event management, user management, global event access
  - `admin` - Write access to events and data, requires per-event authorization
  - `user` - Read-only, requires per-event authorization (default)
- Per-event access: Admin/User roles validated against `event.authorizedUserIds` array
- Root/Marketing have implicit global access
- Permission helpers: `canWrite()`, `canManageEvents()` in `lib/roles.ts`

## Monitoring & Observability

**Error Tracking:**
- Sentry (`@sentry/nextjs` 10.33.0)
  - Project: "ai-event-worker" (org: "maximcorp")
  - Coverage: Client, server, and edge runtimes via instrumentation
  - Configuration: `sentry.server.config.ts`, `sentry.edge.config.ts`
  - Features:
    - Source map uploads for better stack traces (widenClientFileUpload: true)
    - Tunnel route: `/monitoring` (bypasses ad-blockers)
    - Vercel Cron Monitor integration (automaticVercelMonitors: true)
    - Tree-shaking: Removes debug logging in production
  - Implementation: `instrumentation.ts` registers Sentry and exports `onRequestError`

**Logs:**
- Standard `console.log()`, `console.error()` (no structured logging framework detected)
- Prisma query logging available via `log` option in PrismaClient (not currently enabled)

**Status Monitoring:**
- `/api/chat/status` endpoint provides chat system health

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from next.config.ts Sentry integration, standaloneoutput mode, Cron Monitor support)

**CI Pipeline:**
- Not detected in codebase (Vercel uses git push-based CI/CD)

**Environment Variables:**
```
# Database
POSTGRES_PRISMA_URL (or DATABASE_URL)

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_DISABLE_CLERK_AUTH=true  (for testing)

# File Storage (Cloudflare R2)
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL

# Email (nodemailer/SMTP)
SMTP_HOST
SMTP_PORT
SMTP_SECURE (true/false)
SMTP_USER
SMTP_PASS
SMTP_FROM

# Location Services (Mapbox)
MAPBOX_ACCESS_TOKEN

# Error Tracking (Sentry)
SENTRY_AUTH_TOKEN
CI (set by Vercel for build context)

# AI & Intelligence
NEXT_PUBLIC_WS_URL (WebSocket URL for OpenClaw, defaults to ws://localhost:8080/)
NEXT_PUBLIC_APP_URL (Public app URL for intelligence email unsubscribe links, e.g., https://www.aieventplanner.work)

# Machine-to-Machine Auth
CRON_SECRET_KEY (Bearer token for /api/intelligence/session, /api/intelligence/targets, /api/webhooks/intel-report)
BACKUP_SECRET_KEY (Bypass auth for /api/settings/export endpoint)
```

**Build Process:**
```bash
npm run build
# Runs: node scripts/db-check.js && prisma migrate deploy && next build
```

## Webhooks & Callbacks

**Incoming:**
- `/api/webhooks/intel-report` - OpenClaw intelligence report ingestion (auth: `CRON_SECRET_KEY` Bearer token)
  - Receives `IntelligenceReport` data (runId, targetType, targetName, summary, salesAngle, fullReport)
  - Stores reports in database with idempotent `(runId, targetName)` composite unique key
  - Triggers intelligence report email distribution to subscribed users

**Outgoing:**
- `/api/intelligence/unsubscribe` - Email unsubscribe callback (public link)
  - Disables `IntelligenceSubscription.active` flag
  - Uses `unsubscribeToken` from email for verification

## Action Confirmation Protocol

OpenClaw write operations require user confirmation:

1. Kenji proposes action (create/update/cancel meeting, update ROI targets, update company)
2. ws-proxy sends `pending_action` WebSocket frame containing:
   - `actionId` - Unique identifier
   - `tool` - Tool name
   - `preview` - Human-readable action description
3. `IntelligenceChat.tsx` renders `ActionConfirmCard` with Confirm/Reject buttons
4. User clicks Confirm → browser sends `/api/intelligence/actions` with `confirmed: true`
5. OpenClaw executes action and returns result
6. Card updates with success/error status

Supported action tools:
- `createMeeting`, `updateMeeting`, `cancelMeeting`
- `updateROITargets` (accepts `targetCompanyNames`/`targetCompanyIds` and `marketingPlan`)
- `updateCompany`
- `addAttendee`

---

*Integration audit: 2026-03-17*
