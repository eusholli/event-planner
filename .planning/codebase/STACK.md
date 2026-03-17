# Technology Stack

**Analysis Date:** 2026-03-17

## Languages

**Primary:**
- TypeScript 5 - Full codebase (Next.js, React, Node.js)
- JavaScript - Configuration and build scripts

**Secondary:**
- SQL - PostgreSQL queries via Prisma ORM

## Runtime

**Environment:**
- Node.js >=24.0.0 (required in `package.json` engines field)

**Package Manager:**
- npm - Specified in `package.json`
- Lockfile: `package-lock.json` (present in repo)

## Frameworks

**Core:**
- Next.js 16.1.4 - Full-stack React framework with App Router
- React 19.2.3 - UI component library
- React DOM 19.2.3 - React rendering

**UI & Styling:**
- Tailwind CSS 4 - Utility-first CSS framework with PostCSS plugin (`@tailwindcss/postcss`)
- lucide-react 0.575.0 - Icon library

**Database:**
- Prisma 7.4.0 - ORM for PostgreSQL
- @prisma/adapter-pg 7.4.0 - Native connection pooling adapter using `pg` driver
- pg 8.17.2 - PostgreSQL client (required by adapter)

**AI & LLM:**
- Vercel AI SDK 5.0.0 (`ai` package) - Streaming text generation with multi-step tool execution
- @ai-sdk/google 2.0.0 - Google Generative AI provider
- @google/generative-ai 0.24.1 - Direct Google Gemini API client

**Calendar & Meeting:**
- react-big-calendar 1.19.4 - Drag-and-drop calendar scheduler
- react-dnd 16.0.1 - Drag-and-drop primitives
- react-dnd-html5-backend 16.0.1 - HTML5 drag-and-drop backend
- moment 2.30.1 - Date/time utilities
- ics 3.8.1 - ICS calendar invite generation

**Maps & Location:**
- react-leaflet 5.0.0 - React wrapper for Leaflet
- leaflet 1.9.4 - Interactive maps
- @mapbox/mapbox-sdk 0.16.2 - Mapbox geocoding client

**PDF Generation:**
- jspdf 3.0.4 - PDF creation
- jspdf-autotable 5.0.2 - PDF table generation

**Authentication:**
- @clerk/nextjs 6.36.10 - Clerk authentication middleware and components

**Email:**
- nodemailer 7.0.11 (dev dependency) - Email transmission via SMTP

**Content & Markdown:**
- react-markdown 10.1.0 - Markdown rendering in React
- remark-gfm 4.0.1 - GitHub Flavored Markdown support

**Error Tracking:**
- @sentry/nextjs 10.33.0 - Sentry error tracking for client/server/edge runtimes

**File Storage:**
- @aws-sdk/client-s3 3.956.0 - AWS S3 client (used for Cloudflare R2 S3-compatible API)

**Utilities:**
- uuid 13.0.0 - UUID generation
- zod 3.24.1 - TypeScript-first schema validation and parsing
- clsx 2.1.1 - Conditional CSS class binding
- dotenv 17.2.3 - Environment variable loading

**Testing & Development:**
- @playwright/test 1.57.0 - End-to-end browser testing
- TypeScript - Type checking during development

## Configuration

**Environment:**
- Environment variables loaded via `.env` file and prefixed `.env.*` variants for branch-specific databases
  - `.env.main` - Main branch (V1 single-event schema) database URL
  - `.env.multi` - Multi-event branch (V2 multi-event schema) database URL
  - Branch switching: `npm run db:main` or `npm run db:multi` swaps env and regenerates Prisma client
- `NEXT_PUBLIC_*` variables accessible in browser
- Non-public variables for server-only configuration

**Build:**
- `next.config.ts` - Next.js configuration with Sentry integration
- `tsconfig.json` - TypeScript compiler options with `@/*` path alias
- `eslint.config.mjs` - ESLint configuration extending next/core-web-vitals and next/typescript
- Sentry webpack plugin integrated for source map uploads

**Database Migrations:**
- Prisma migrations in `prisma/migrations/` directory
- Migration deployment: `prisma migrate deploy` (automatic in `npm run build`)
- Database schema: `prisma/schema.prisma` (PostgreSQL provider)

## Platform Requirements

**Development:**
- Node.js >=24.0.0
- npm or compatible package manager
- PostgreSQL 12+ (local or remote)
- Prisma CLI: `npx prisma`

**Production:**
- Deployment target: Vercel (configured with Sentry monitoring and Cron Monitors support)
- Standalone output mode: `output: 'standalone'` in next.config.ts for efficient container deployment
- Edge runtime support for middleware and specific API routes

**Build Commands:**
```bash
npm run dev              # Development server with hot reload
npm run build            # Production build (DB check + migrate + build)
npm run start            # Start production server
npm run lint             # Run ESLint checks
npm run db:main          # Switch to main branch database
npm run db:multi         # Switch to multi-event branch database
```

## Key Dependencies Rationale

**@prisma/adapter-pg:** Custom adapter enables connection pooling (critical for serverless/Vercel) instead of default Prisma client which lacks pooling. Uses native `pg` driver directly.

**Vercel AI SDK 5.0:** Provides streaming text generation with multi-step tool execution (max 5 steps) required for event-scoped AI chat and OpenClaw integration.

**@sentry/nextjs:** Comprehensive error tracking across Node.js, edge, and client runtimes with Vercel Cron Monitor integration.

**Tailwind CSS 4:** Modern utility-first CSS with PostCSS support (replacing older Tailwind v3 patterns).

---

*Stack analysis: 2026-03-17*
