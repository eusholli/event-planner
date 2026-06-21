# Event Planner

A multi-event management platform for orchestrating corporate conferences —
meetings, attendees, rooms, schedules, and ROI — with an integrated AI stack for
market intelligence and content generation.

Built with **Next.js 16**, **Prisma** (PostgreSQL), **Clerk** auth, the
**Vercel AI SDK** with **Google Gemini**, and an **OpenClaw** intelligence agent.

## 📖 Documentation

- **[USER_MANUAL.md](USER_MANUAL.md)** — how to use the app (for end users).
- **[DEVELOPER.md](DEVELOPER.md)** — architecture, local setup, and deployment
  (for developers). Start here if you're running or building the system.

## Features

- **Multi-event portfolio** — list, calendar, and map views; status workflow
  (Pipeline → Committed → Occurred → Canceled); slug-based URLs; per-event access
  control.
- **Meetings** — drag-and-drop calendar, room conflict detection, ICS invite
  emails, briefing-book PDFs, read-only mode for past events.
- **Attendees & companies** — shared system-level directories, AI auto-complete
  (title/bio/LinkedIn via Gemini), centralized company pipeline values.
- **ROI tracking** — set financial/meeting/engagement targets, auto-track
  actuals from meeting data, and use Gemini "sparkle" buttons to draft a marketing
  plan and auto-fill targets and target companies.
- **AI chat assistant** (`/events/[id]/chat`) — event-scoped Gemini chat with tool
  calling over your meetings, attendees, and rooms.
- **OpenClaw Insights** (`/intelligence`) — system-wide market-intelligence agent
  with real-time chat and scheduled research reports.
- **LinkedIn campaigns** — generate polished articles via the li-agent service.
- **Content tasks** — editorial calendar for newsletters, podcasts, articles, etc.
- **Admin** — role management, system settings, data ingestion, AI usage logs.
- **RBAC** — Root / Marketing / Admin / User roles via Clerk.

See the [User Manual](USER_MANUAL.md) for the full feature walkthrough.

## Quick Start

```bash
git clone <repository-url>
cd event-planner
npm install
cp .env.example .env        # set DATABASE_URL + Clerk keys (or skip auth, below)
npx prisma migrate dev
npm run dev                 # http://localhost:3000
```

To skip authentication during local development, set
`NEXT_PUBLIC_DISABLE_CLERK_AUTH=true` in `.env` (runs as a mock root user).

The AI intelligence (OpenClaw) and LinkedIn-article features need the companion
services in `~/dev/sales-recon` and `~/dev/li-agent`. See
**[DEVELOPER.md](DEVELOPER.md)** for the full multi-service setup, the complete
environment-variable reference, and deployment.

## Tech Stack

| Area | Technology |
| :--- | :--- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Clerk |
| AI | Vercel AI SDK 5 + Google Gemini; OpenClaw agent (via ws-proxy) |
| Styling | Tailwind CSS v4 |
| Storage / Maps | Cloudflare R2; Mapbox + Leaflet |
| PDF / Email | jsPDF; nodemailer + ICS |
| Monitoring | Sentry |
| Deployment | Docker + Traefik (Hetzner VPS), or Vercel + Supabase |

Requires **Node.js >= 24**.

## License

Proprietary.
