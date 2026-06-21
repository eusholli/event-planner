# Developer Guide

Everything a developer needs to understand, run, and deploy the Event Planner
system. For end-user feature docs see **[USER_MANUAL.md](USER_MANUAL.md)**; for a
quick project summary see **[README.md](README.md)**.

---

## 1. System Overview

Event Planner is one app made of three repositories that run as separate
services. The **event-planner** web app is the anchor; the other two power the AI
intelligence and content features.

| Repo | Path | Role |
| :--- | :--- | :--- |
| **event-planner** | `~/dev/event-planner` | Next.js 16 web app + Postgres. Also hosts the OpenClaw "Insights" chat UI. |
| **sales-recon** | `~/dev/sales-recon` | OpenClaw AI gateway (Docker), the `ws-proxy` browser↔OpenClaw bridge, a Viber bot proxy, the gbrain vector DB, the agent workspace (`openclaw-data/`), and the cron registrar (`event-planner-cron.py`). |
| **li-agent** | `~/dev/li-agent` | FastAPI service that generates LinkedIn articles (DSPy + RAG + scoring). |

### Architecture

```
                          ┌─────────────────────────────────────────┐
   Browser (Clerk JWT) ───┤ event-planner (Next.js, :3000)           │
        │                 │   • app/api/*  REST + webhooks            │
        │  WebSocket      │   • Postgres (events, attendees, ...)     │
        │  (Clerk JWT)    └───────────────┬─────────────────────────-┘
        ▼                                 │ HTTP (SSE)
  ┌──────────────┐                        ▼
  │  ws-proxy    │                 ┌──────────────┐
  │   :8080      │                 │  li-agent    │  LinkedIn articles
  │ (sales-recon)│                 │   :8000      │
  └──────┬───────┘                 └──────────────┘
         │ device-signed handshake +
         │ OPENCLAW_GATEWAY_TOKEN
         ▼
  ┌──────────────────┐   tools call back into     ┌───────────────────────────┐
  │ OpenClaw gateway │──  event-planner /api/* ───▶│ event-planner             │
  │   :50045         │   (action token)            │  /api/intelligence/actions│
  │ (sales-recon)    │   reports ▶ /api/webhooks/intel-report
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │ gbrain Postgres  │  (pgvector knowledge base)
  │ (sales-recon)    │
  └──────────────────┘

In production every service sits behind a shared Traefik reverse proxy (TLS).
```

### Trust & auth chain

- **Browser → ws-proxy** and **browser → li-agent**: Clerk JWT (passed as a query
  param / bearer). Verified with `@clerk/backend`.
- **ws-proxy/li-agent → event-planner**: machine-to-machine calls authenticated
  with the shared `CRON_SECRET_KEY` bearer token. ws-proxy posts intelligence
  reports to `/api/webhooks/intel-report`; li-agent verifies Clerk JWTs by calling
  `/api/intelligence/session`.
- **OpenClaw tools → event-planner**: `/api/intelligence/session` exchanges a
  Clerk JWT for a short-lived **action token** that OpenClaw tools use when
  calling `/api/intelligence/actions`.
- **ws-proxy → OpenClaw**: a device-signed Ed25519 handshake plus
  `OPENCLAW_GATEWAY_TOKEN`.

---

## 2. Local Development Setup

### Prerequisites

- Node.js **>= 24**
- PostgreSQL (local install or Docker)
- Docker + Docker Compose (for the OpenClaw stack)
- Python 3.12 (for li-agent, if running it outside Docker)
- A Google Gemini API key (optional, for AI features)

### event-planner (the web app)

```bash
cd ~/dev/event-planner
npm install
cp .env.example .env        # then fill in values (see §3)
npx prisma migrate dev      # create/seed the database schema
npm run dev                 # http://localhost:3000
```

The app uses a **single PostgreSQL database** configured via `.env`. This is the
default and only configuration. `npm run db:main` re-applies `.env.main` to
`.env` and regenerates the Prisma client if you keep a canonical copy there.

For fast UI work without configuring Clerk, set `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true`
to run as a mock root user.

The Gemini API key used by the app's own AI features is stored in the
**`SystemSettings` database table** (set it in `/settings`), not in an env var.

### sales-recon (OpenClaw intelligence stack)

```bash
cd ~/dev/sales-recon
cp .env.example .env        # fill in API keys + tokens
docker compose up -d --build
```

This brings up four containers on the `sales-recon-net` network:

| Service | Container | Port | Purpose |
| :--- | :--- | :--- | :--- |
| OpenClaw gateway | `sales-recon-openclaw` | 50045 | AI agent "Kenji" (`ghcr.io/openclaw/openclaw:2026.5.22`) + gbrain + web tools |
| ws-proxy | `sales-recon-ws-proxy` | 8080 | Authenticated browser↔OpenClaw WebSocket bridge |
| Viber proxy | `sales-recon-viber-proxy` | 8081 | Viber bot webhook receiver |
| gbrain DB | `sales-recon-postgres` | 5432 | `pgvector` knowledge base |

`docker-compose.override.yml` (local, gitignored) exposes the ports above for
local development. Point the web app at the proxy with
`NEXT_PUBLIC_WS_URL=ws://localhost:8080/`.

Run OpenClaw's CLI inside the container with this host alias:

```bash
sales-recon-openclaw() {
  docker compose exec -u node sales-recon-openclaw node openclaw.mjs "$@"
}
# e.g.  sales-recon-openclaw cron list
```

### li-agent (LinkedIn article generator)

```bash
cd ~/dev/li-agent
cp .env.example .env
# Either run directly:
uvicorn api:app --host 0.0.0.0 --port 8000
# Or with Docker:
docker compose up -d --build
```

Then tell the web app where it lives:
`NEXT_PUBLIC_LI_ARTICLE_API_URL=http://localhost:8000`.

---

## 3. Environment Variables

Set these in each repo's `.env`. **Required** = the feature breaks without it;
optional features degrade gracefully.

### event-planner

| Variable | Req | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` / `POSTGRES_PRISMA_URL` | ✅ | Postgres connection (pooled) |
| `POSTGRES_URL_NON_POOLING` | for migrations | Direct connection for Prisma migrate |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅* | Clerk public key |
| `CLERK_SECRET_KEY` | ✅* | Clerk secret key |
| `NEXT_PUBLIC_DISABLE_CLERK_AUTH` | – | `true` to bypass auth locally (mock root) |
| `CRON_SECRET_KEY` | ✅ | Bearer token for machine-to-machine API routes (intelligence, webhooks, session) |
| `NEXT_PUBLIC_WS_URL` | – | ws-proxy URL for Insights (default `ws://localhost:8080/`) |
| `NEXT_PUBLIC_LI_ARTICLE_API_URL` | – | li-agent URL (default `http://localhost:8000`) |
| `NEXT_PUBLIC_APP_URL` | – | Public app URL for email/unsubscribe links |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | for images | Cloudflare R2 storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | for email | Meeting invites + intelligence emails |
| `MAPBOX_ACCESS_TOKEN` | for maps | Geocoding / venue maps |
| `SENTRY_AUTH_TOKEN` | – | Error tracking |
| `BACKUP_SECRET_KEY` | – | Bypass auth on the backup export endpoint |

\* Not required when `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true`.
The app's Gemini key is in the `SystemSettings` DB table, **not** an env var.

### sales-recon

| Variable | Purpose |
| :--- | :--- |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway bearer token (shared with ws-proxy as `OPENCLAW_TOKEN`) |
| `GBRAIN_POSTGRES_PASSWORD` | gbrain Postgres password |
| `WS_PROXY_CLERK_SECRET_KEYS` / `CLERK_SECRET_KEY` | Clerk secret(s) for JWT verification in ws-proxy |
| `WEBAPP_URL` | event-planner base URL the proxy calls back into |
| `CRON_SECRET_KEY` | Shared secret for webhook/cron calls to event-planner |
| `CRON_EVENT_PLANNER_DNS` | Public event-planner URL used by cron jobs |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, … | LLM providers for the agent |
| `BRAVE_API_KEY` / `TAVILY_API_KEY`, `FIRECRAWL_API_KEY` | Web search + scraping |
| `VIBER_BOT_TOKEN`, `VIBER_BOT_NAME`, `VIBER_APP_URL` | Viber bot (optional) |

### li-agent

| Variable | Purpose |
| :--- | :--- |
| `GEMINI_API_KEY` | Default generation/judge/RAG models |
| `OPENROUTER_API_KEY` | Alternative LLM provider |
| `TAVILY_API_KEY` | Web search for RAG (optional; generation continues without) |
| `WEBAPP_URL` | event-planner URL used to verify Clerk JWTs |
| `CRON_SECRET_KEY` | Shared secret for the `/api/intelligence/session` call |

---

## 4. Codebase Tour (event-planner)

```
app/
  api/            REST routes + webhooks (events, meetings, attendees, admin,
                  intelligence, content-tasks, chat, ...)
  events/[id]/    Event-scoped pages (dashboard, roi, attendees, companies,
                  calendar, chat, rooms, new-meeting, settings, ...)
  admin/          System + user administration, AI logs, data ingestion
  intelligence/   OpenClaw Insights chat UI + subscriptions
  content/        Editorial content tasks (list + calendar)
lib/
  prisma.ts       Prisma client (pg adapter, pooled, dev singleton)
  with-auth.ts    Auth wrapper for API routes
  roles.ts        Permission helpers: canWrite(), canManageEvents()
  access.ts       Per-event authorization (authorizedUserIds)
  action-tokens.ts Signed action tokens for OpenClaw tools
  tools/          AI chat tools (getMeetings, getAttendees, createMeeting, ...)
  mcp/            MCP tool definitions
  email.ts, calendar-sync.ts, briefing-book.ts, storage.ts, geocoding.ts, gemini.ts
components/       React components (Navigation, MeetingModal, IntelligenceChat, ...)
prisma/           schema.prisma + migrations
scripts/          db-check, seed, prod backup/reset scripts
```

### Routing & event scoping

Event routes use `/events/[id]/*` where `[id]` is a UUID **or** slug. Resolve
both to the canonical UUID in API routes:

```ts
const event = await prisma.event.findFirst({
  where: { OR: [{ id: eventId }, { slug: eventId }] },
})
const resolvedEventId = event.id
```

### RBAC

Roles live in `lib/constants.ts`; enforcement in `lib/with-auth.ts`,
`lib/roles.ts`, `lib/access.ts`.

| Role | Access |
| :--- | :--- |
| `root` | Everything, including system settings |
| `marketing` | Write + event/user management; global event access |
| `admin` | Write to authorized events only |
| `user` | Read-only on authorized events (default for new users) |

`root`/`marketing` have implicit global access; `admin`/`user` must be listed in
`event.authorizedUserIds`. New Clerk users get `user` via `/api/user/init`
(triggered by the `RoleSynchronizer` component).

Standard API guard:

```ts
import { canWrite } from '@/lib/roles'
if (!await canWrite()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

> After changing anything under `app/api/`, `lib/with-auth.ts`, `lib/roles.ts`,
> or `lib/access.ts`, run the **`/rbac-check`** review. After changing
> `prisma/schema.prisma`, run **`sync-schema-exports`**.

---

## 5. OpenClaw Intelligence Integration

Two separate things share the OpenClaw stack:

### Real-time chat (`/intelligence`)

1. The browser opens a WebSocket to **ws-proxy** with its Clerk JWT.
2. ws-proxy verifies the JWT and calls `/api/intelligence/session` (bearer
   `CRON_SECRET_KEY`) to get an **action token**.
3. ws-proxy forwards the message (with an action-context block) to OpenClaw and
   streams back status / thinking / tool-call / chunk events.
4. `components/IntelligenceChat.tsx` renders the stream with typing indicators and
   markdown. Chat history is persisted server-side per Clerk userId in ws-proxy.

OpenClaw write actions (create/update/cancel meeting, update ROI, update company)
execute **without** an in-app confirmation step — the old `ActionConfirmCard` UI
has been removed.

### Scheduled intelligence cron

`~/dev/sales-recon/event-planner-cron.py` registers OpenClaw cron jobs (run it
once after deploying the stack; it reads `CRON_EVENT_PLANNER_DNS` and
`CRON_SECRET_KEY` from `.env`):

| Job | Schedule | Action |
| :--- | :--- | :--- |
| `market-intelligence-weekly` | `0 1 * * 1` (Mon 01:00 UTC) | Runs `intel-dispatcher.py`: pulls targets from `/api/intelligence/targets`, researches each, posts results to `/api/webhooks/intel-report`, dispatches emails |
| `gbrain-dream-cycle-nightly` | `0 3 * * *` (daily 03:00 UTC) | Runs the gbrain `autopilot-cycle` to consolidate memory |

> The schedule is defined in `event-planner-cron.py` — treat that file as the
> source of truth (older docs referenced different times).

### Agent workspace & memory

The agent definition lives in `~/dev/sales-recon/openclaw-data/workspace`
(`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `MARKETING.md`, etc.). Per-target memory
files (`memory/{Company_Name}.md`, `memory/{First_Last}.md`) are structured as:

```markdown
## Latest      # newest updates first (≤20 lines)
## Profile     # static role/bio/background
## Key Decision Makers  # companies only
## Archive     # older entries
```

The OpenClaw tool surface (`/api/intelligence/actions`) includes `getMeetings`,
`createMeeting`, `cancelMeeting`, `updateMeeting`, `getAttendees`, `addAttendee`,
`getRooms`, `getROITargets`, `updateROITargets`, `updateCompany`, `getEvent`,
`listEvents`, and more.

---

## 6. LinkedIn Article Service (li-agent)

A FastAPI service that turns a draft into a polished LinkedIn article using DSPy
iterative generation, Tavily web research, a 180-point scoring system, and
optional humanization. It streams progress over **Server-Sent Events**.

- Endpoint the app uses: `POST /articles/generate` (SSE). Also `POST /humanize`
  and `GET /health`.
- Generation typically takes 5–20 minutes; keep the HTTP connection alive.
- The app calls it from the LinkedIn campaign builder
  (`app/events/[id]/linkedin-campaigns/page.tsx`) and `components/roi/LinkedInModal.tsx`.
- Auth: the request carries a Clerk JWT; li-agent verifies it against the web app
  (`WEBAPP_URL` + `CRON_SECRET_KEY`). Requires `root` or `marketing` role.

---

## 7. Deployment (Production)

Everything runs as Docker containers on a **Hetzner VPS** (Ubuntu 24.04, at least
CX32 / 8 GB RAM — OpenClaw runs Chromium and is memory-hungry), behind a shared
**Traefik** reverse proxy on the external `webproxy` Docker network. Traefik
terminates TLS via Let's Encrypt and routes by hostname.

Each repo deploys with the same pattern:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- **event-planner**: `docker-compose.prod.yml` defines the app + Postgres with
  Traefik labels. `npm run build` runs a DB check + `prisma migrate deploy` before
  building.
- **sales-recon**: brings up OpenClaw, ws-proxy, viber-proxy, and gbrain Postgres.
  After the OpenClaw healthcheck passes, run `python3 event-planner-cron.py` to
  register the cron jobs.
- **li-agent**: single FastAPI container; Traefik forwards SSE with
  `flushInterval=1ms` so streaming works.

The `webproxy` network is shared across all three repos so Traefik can route to
every service. Set each service's public hostname via its `.env` and Traefik host
labels.

> The web app can alternatively be hosted on **Vercel + Supabase** instead of the
> Hetzner container — the app code is unchanged; only `DATABASE_URL` and build
> settings differ.

---

## 8. Database Backup & Recovery

- **Automated backups**: a GitHub Actions cron `pg_dump`s the database to a
  Cloudflare R2 bucket (`db-backups`).
- **Auto-backup before destructive ops**: deletes/resets trigger a backup first.
- **Manual prod scripts**: `scripts/db-backup-prod.sh`, `scripts/db-reset-prod.sh`.

### Restore (summary — always test locally first)

```bash
# 1. Download + unzip the backup from R2
gzip -d backup-YYYY-MM-DD.sql.gz

# 2. Test-restore into a throwaway local Postgres
docker run --name restore-test -e POSTGRES_PASSWORD=password -p 5433:5432 -d postgres:17-alpine
psql "postgres://postgres:password@localhost:5433/postgres" -f backup-YYYY-MM-DD.sql
# verify: \dt and SELECT count(*) FROM "Meeting";
docker rm -f restore-test

# 3. Restore into the EMPTY production database (reset it first)
psql "<direct-connection-string>" -f backup-YYYY-MM-DD.sql
```

Backups contain `CREATE TABLE` only — restore into an **empty** database or you
get "relation already exists" errors. "Role does not exist" warnings on a local
restore are harmless.

---

## 9. Development Commands

```bash
npm run dev              # Dev server (localhost:3000)
npm run build            # DB check + prisma migrate deploy + next build
npm run lint             # ESLint
npx prisma studio        # Browse the database
npx prisma migrate dev   # Create + apply a migration
```

See **[CLAUDE.md](CLAUDE.md)** for deeper architecture notes and gotchas used by
AI tooling.
