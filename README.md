# Event Planner — Executive Meeting Coordinator

A comprehensive multi-event management platform for orchestrating corporate meetings, attendees, and schedules. Built with Next.js 16, Prisma (PostgreSQL), Clerk authentication, and powered by Google Gemini AI.

## 📖 User Manual

For a detailed guide on how to use the application, see the **[User Manual](USER_MANUAL.md)**.

## Features

### Multi-Event Portfolio
- **Events Portfolio**: Central hub with **List**, **Calendar**, and **Map** views for managing all events.
- **Event Status Workflow**: Pipeline (Amber) → Committed (Green) → Occurred (Grey, Read-Only) → Canceled (Red).
- **Slug-Based URLs**: Human-friendly event URLs (e.g., `/events/mwc-2025`).
- **Event Password Protection**: Optional password gating for sharing events securely.
- **Authorized User Access**: Per-event user access control for Admin and User roles.
- **Event Navigation**: Event pages logically grouped into Performance, Audience, and Logistics sub-menus.

### Meeting Management
- **Dashboard**: Real-time overview of meeting stats, attendee counts, and room utilization.
- **New Meeting Page**: Comprehensive form for creating meetings with attendees, rooms, tags, types, and scheduling.
- **Calendar**: Drag-and-drop scheduling with `react-big-calendar`. Supports day, week, and month views.
- **Meeting Status Lifecycle**: Pipeline → Confirmed → Occurred → Canceled.
- **Meeting Tags & Types**: Customizable categorization per event.
- **Read-Only Mode**: Events with "Occurred" status lock all editing to preserve historical data.

### Attendee Management & Companies
- **Attendee Directory**: Sortable, searchable list with profile cards.
- **Company Management**: Shared directory of relational company records, inherently preventing duplicate names and centralizing pipeline values.
- **AI-Powered Auto Complete**: Enter a name and company — Google Gemini populates title, bio, LinkedIn URL, and company description.
- **Attendee Types**: Customizable types (e.g., VIP, Speaker, Staff).
- **Profile Images**: Upload and auto-resize attendee photos.
- **Briefing Books**: Generate per-attendee and per-room PDF briefing books with full meeting schedules.

### AI Systems
- **AI Chat Assistant** (`/events/[id]/chat`): Built-in conversational AI using Vercel AI SDK 5.0 and Google Gemini. Context-aware of event data with tool-calling for searching meetings, attendees, rooms, and generating navigation links. Persistent chat history per event.
- **OpenClaw Insights** (`/intelligence`): Market intelligence agent powered by OpenClaw via WebSocket proxy (`ws-proxy`). Features real-time streaming responses, thinking/status indicators, session management, and PDF download for each response.
- **AI Marketing Plan Generation**: Generate a tailored event marketing plan via Gemini directly from the Sparkles icon on event cards in the portfolio. The plan is saved to the event's ROI record and can be used to auto-populate ROI targets.
- **ROI Auto-Fill (Sparkle Buttons)**: Three Gemini-powered sparkle buttons on the ROI page auto-extract and populate Financial Targets, Event KPI Targets, and Target Companies from the event's marketing plan. Each button shows a confirmation panel before applying changes and only fills empty fields.

### Rooms
- **Room Management**: Create and manage rooms with capacity tracking.
- **Room Briefing Books**: Per-room PDF briefing books with all scheduled meetings.

### Reports & Export
- **Reports Page**: Analytics on meeting breakdown by status with attendee engagement stats.
- **Filtering**: Filter by meeting type, tags, attendee type (internal/external).
- **Export**: CSV and PDF exports for offline analysis.
- **Briefing Book PDF**: One-click generation from the Dashboard.
- **Calendar View PDF**: Export the full calendar as a formatted PDF.

### Event Settings (Per-Event)
- **Configuration**: Event name, dates, timezone, region, address, booth location, URL, description, and password.
- **Tags, Meeting Types, Attendee Types**: Per-event customization (inherited from system defaults).
- **Authorized Users**: Grant or revoke access for individual Admin/User accounts with server-side paginated search.
- **AI Scraper**: Auto-fill event details from a URL using AI.
- **Event Import/Export**: Per-event JSON data import and export with auto-backup before destructive operations.

### Administration
- **System Administration** (`/admin/system`, Root only): Global settings including Gemini API key, default tags, meeting types, attendee types. Full system backup/restore and factory reset.
- **User Administration** (`/admin/users`, Root/Marketing): Manage user roles with search and pagination. Supports user deletion.

### Authentication & RBAC
- **Clerk Authentication**: Secure user sessions with modal sign-in/sign-up.
- **Role-Based Access Control**:
  - **Root**: Full system access — settings, users, all events.
  - **Marketing**: Event management + user management. Cannot access system settings.
  - **Admin**: Operational access within authorized events. Can create/edit meetings, attendees, rooms. Cannot create/delete events.
  - **User**: Read-only access within authorized events.
- **Auth Bypass**: `NEXT_PUBLIC_DISABLE_CLERK_AUTH=true` for local development/testing.

### Monitoring & Backups
- **Sentry**: Error tracking and performance monitoring.
- **Automated Backups**: GitHub Actions cron job for database backup to Cloudflare R2.
- **Auto-Backup**: Automatic JSON backup before any destructive operation (delete, reset).

## Getting Started

### Prerequisites

- Node.js (v24 or higher)
- PostgreSQL database
- Clerk Account (for authentication)
- Sentry Account (optional, for monitoring)
- Google Gemini API Key (optional, for AI features)
- OpenClaw + ws-proxy (optional, for OpenClaw Insights)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd event-planner
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Create a `.env` file in the root directory:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/event_planner?schema=public"

    # Clerk Authentication
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
    CLERK_SECRET_KEY=sk_test_...
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

    # Sentry (Optional)
    SENTRY_AUTH_TOKEN=...

    # OpenClaw Insights WebSocket (Optional)
    NEXT_PUBLIC_WS_URL=ws://localhost:8080/

    # Scheduled Cron Secret Key (Required for Data Sync)
    CRON_SECRET_KEY=your_secure_secret_key

    # Disable Auth for Testing (Optional)
    # NEXT_PUBLIC_DISABLE_CLERK_AUTH=true
    ```

4.  **Initialize Database**:
    ```bash
    npx prisma migrate dev
    ```

5.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the app.

## Development

### Database Management

- **View Database**: `npx prisma studio`
- **Apply Migrations**: `npx prisma migrate dev`
- **Switch Environments**: `npm run db:main` / `npm run db:multi`

### Project Structure

- `app/` — Next.js App Router pages and API routes
- `app/events/[id]/` — Event-scoped pages (dashboard, attendees, rooms, calendar, chat, intelligence, reports, settings, new-meeting)
- `app/admin/` — System and user administration
- `components/` — Reusable React components (Navigation, MeetingModal, AddAttendeeForm, etc.)
- `lib/` — Utilities, Prisma client, AI tools, PDF generation, role helpers
- `lib/tools/` — AI chat tool definitions (getMeetings, getAttendees, getRooms, etc.)
- `prisma/` — Database schema and migrations
- `scripts/` — Build, deployment, and database utility scripts
- `public/` — Static assets

## Technologies

- [Next.js 16](https://nextjs.org/) — React Framework (App Router)
- [Prisma](https://www.prisma.io/) — ORM with PostgreSQL adapter
- [Tailwind CSS v4](https://tailwindcss.com/) — Styling
- [Clerk](https://clerk.com/) — Authentication & User Management
- [Vercel AI SDK 5.0](https://sdk.vercel.ai/docs) — AI Chat (Core & React)
- [Google Gemini](https://ai.google.dev/) — LLM Provider
- [OpenClaw](https://openclaw.com/) — Market Intelligence Agent (via ws-proxy)
- [Sentry](https://sentry.io/) — Error Tracking & Performance Monitoring
- [Leaflet](https://leafletjs.com/) / [React Leaflet](https://react-leaflet.js.org/) — Interactive Maps
- [react-big-calendar](https://github.com/jquense/react-big-calendar) — Drag-and-Drop Calendar
- [jsPDF](https://github.com/parallax/jsPDF) — PDF Generation
- [Docker](https://www.docker.com/) — Local Development & Deployment
- [Cloudflare R2](https://www.cloudflare.com/products/r2/) — Backup Storage
