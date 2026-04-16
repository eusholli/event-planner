---
name: rbac-check
description: Audit API routes for RBAC correctness after any change to app/api/, lib/with-auth.ts, lib/role-utils.ts, or lib/access.ts. Checks withAuth coverage, permission helper correctness, and per-route policy conformance. Reports pass/fail per check.
user-invocable: true
allowed-tools: Read, Grep
---

# RBAC Verification Checklist

Run this skill after any change to API routes or auth helpers to verify RBAC correctness.

## Canonical Policy

### Permission Helpers (`lib/role-utils.ts`)
- `hasWriteAccess`: Root | Marketing | Admin
- `hasCreateAccess`: Root | Marketing | Admin | User  ← Marketing MUST be included
- `canManageEvents`: Root | Marketing
- `isRootUser`: Root only

### Route Policy Table

| Route | GET | POST | PUT/PATCH | DELETE |
|-------|-----|------|-----------|--------|
| /api/settings | root | root | — | — |
| /api/settings/export | root | — | — | — |
| /api/settings/import | — | root | — | — |
| /api/settings/delete-data | — | — | — | root |
| /api/events | auth (all roles see all events) | manageEvents | — | — |
| /api/events/[id] | eventAccess | — | manageEvents | manageEvents |
| /api/events/[id]/roi | eventAccess | write+eventAccess | write+eventAccess | — |
| /api/events/[id]/roi/extract-roi | — | write+eventAccess | — | — |
| /api/events/[id]/roi/generate-plan | — | create+eventAccess | — | — |
| /api/events/[id]/export | write+eventAccess | — | — | — |
| /api/events/[id]/import | — | write+eventAccess | — | — |
| /api/events/[id]/reset | — | write+eventAccess | — | — |
| /api/meetings | eventAccess | create+eventAccess | — | — |
| /api/meetings/[id] | auth+eventAccess | — | auth+eventAccess+owner | auth+eventAccess+owner |
| /api/meetings/[id]/email | — | write+eventAccess | — | — |
| /api/meetings/[id]/invite | write+eventAccess | auth+eventAccess | — | — |
| /api/meetings/check-availability | — | auth | — | — |
| /api/rooms | eventAccess | write+eventAccess | — | — |
| /api/rooms/[id] | — | — | write+eventAccess | write+eventAccess |
| /api/rooms/[id]/briefing | auth+eventAccess | — | — | — |
| /api/attendees | auth | auth | — | — |
| /api/attendees/[id] | — | — | auth | auth |
| /api/attendees/[id]/briefing | auth | — | — | — |
| /api/attendees/autocomplete | — | auth | — | — |
| /api/companies | auth | auth | — | — |
| /api/companies/[id] | auth | — | auth | auth |
| /api/admin/users | manageEvents | manageEvents | — | manageEvents |
| /api/admin/system | root | root | — | — |
| /api/admin/system/export | root | — | — | — |
| /api/admin/system/import | — | root | — | — |
| /api/admin/system/reset | — | root | — | — |
| /api/chat | — | auth+eventAccess | — | — |
| /api/chat/status | auth | — | — | — |
| /api/image-proxy | auth | — | — | — |
| /api/user/init | — | auth | — | — |
| /api/social/drafts | manageEvents | manageEvents | — | — |
| /api/social/drafts/[id] | — | — | manageEvents | manageEvents (own) or root |

**Direct-auth routes** (no `withAuth` wrapper — use direct Clerk `auth()` + `canManageEvents()`):

| Route | Methods | Auth mechanism |
|-------|---------|----------------|
| /api/social/drafts | GET, POST | `auth()` + `canManageEvents()` — Root \| Marketing only |
| /api/social/drafts/[id] | PUT, DELETE | `auth()` + `canManageEvents()` — Root \| Marketing only; DELETE also checks `createdBy === userId` or `isRootUser()` |

**Custom-auth routes** (no `withAuth` wrapper — intentional):

| Route | Method | Auth mechanism |
|-------|--------|----------------|
| /api/intelligence/actions | POST | `verifyActionToken()` — signed action JWT (OpenClaw tool calls) |
| /api/intelligence/session | POST | `CRON_SECRET_KEY` bearer — token exchange for ws-proxy |
| /api/intelligence/targets | GET | `CRON_SECRET_KEY` bearer — cron-triggered target list |
| /api/intelligence/unsubscribe | GET | opaque `unsubscribeToken` query param — email-link unsubscribe (public) |
| /api/webhooks/intel-report | POST | `CRON_SECRET_KEY` bearer — OpenClaw webhook |
| /api/intelligence/report-exists | POST | direct `auth()` — any authenticated user |
| /api/intelligence/report/[targetName] | GET | direct `auth()` OR `verifyReportToken()` JWT — supports email-link access |

**Legend:**
- `auth` = any authenticated user (`requireAuth: true`)
- `eventAccess` = auth + `hasEventAccess` check (via wrapper or manual in handler)
- `write` = `requireRole: 'write'` (Root | Marketing | Admin)
- `create` = `requireRole: 'create'` (Root | Marketing | Admin | User)
- `manageEvents` = `requireRole: 'manageEvents'` (Root | Marketing)
- `root` = `requireRole: 'root'` (Root only)
- `owner` = also allow if user owns the resource (`isOwnerOrCanWrite`)

## Audit Steps

Run these checks in order and report pass/fail for each.

### Step 1: withAuth Coverage
Search all route files in `app/api/**/*.ts` for files that export HTTP handlers (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) but do NOT import from `@/lib/with-auth`. Flag any such file that is NOT in the known custom-auth list below.

```
Grep: pattern "export (const|async function) (GET|POST|PUT|PATCH|DELETE)"
      in files: app/api/**/*.ts
      that do NOT contain: import.*from '@/lib/with-auth'
```

**Known intentional gaps** (custom auth — do NOT flag these):
- `app/api/intelligence/actions/route.ts` — `verifyActionToken()`
- `app/api/intelligence/session/route.ts` — `CRON_SECRET_KEY` bearer
- `app/api/intelligence/targets/route.ts` — `CRON_SECRET_KEY` bearer
- `app/api/intelligence/unsubscribe/route.ts` — unsubscribe token (public)
- `app/api/webhooks/intel-report/route.ts` — `CRON_SECRET_KEY` bearer
- `app/api/social/drafts/route.ts` — direct `auth()` + `canManageEvents()` (Root | Marketing)
- `app/api/social/drafts/[id]/route.ts` — direct `auth()` + `canManageEvents()` (Root | Marketing)
- `app/api/intelligence/report-exists/route.ts` — direct `auth()` (any authenticated user)
- `app/api/intelligence/report/[targetName]/route.ts` — direct `auth()` OR `verifyReportToken()` JWT

Flag any file NOT in this list as a coverage gap.

### Step 2: `canCreate` includes `marketing`
Read `lib/role-utils.ts`. Verify `hasCreateAccess` function includes `Roles.Marketing`.

```
Read: lib/role-utils.ts
Check: hasCreateAccess returns true for Roles.Marketing
Fail if: Roles.Marketing is absent from hasCreateAccess
```

### Step 3: `isOwnerOrCanWrite` scope
Search all route files for `isOwnerOrCanWrite`. It must appear ONLY in `app/api/meetings/[id]/route.ts`.

```
Grep: pattern "isOwnerOrCanWrite"
      in files: app/api/**/*.ts
Expected: only app/api/meetings/[id]/route.ts
Flag any other file as a policy violation
```

### Step 4: Settings routes are root-only
Read all files in `app/api/settings/`. Every exported handler must use `withAuth` with `requireRole: 'root'` OR be the `BACKUP_SECRET_KEY` bypass path.

```
Read: app/api/settings/route.ts
      app/api/settings/export/route.ts
      app/api/settings/import/route.ts
      app/api/settings/delete-data/route.ts
Check: each exported handler uses requireRole: 'root' or is the backup bypass
Fail if: any handler uses a weaker requirement (requireAuth: true, requireRole: 'write', etc.)
```

### Step 6: LinkedIn feature restricted to root + marketing
Read `app/api/social/drafts/route.ts` and `app/api/social/drafts/[id]/route.ts`. Verify both use `canManageEvents()` (not `canWrite()` which also allows Admin). Read `components/Navigation.tsx` and verify the LinkedIn Campaigns entry has `roles: [Roles.Root, Roles.Marketing]`.

```
Read: app/api/social/drafts/route.ts
      app/api/social/drafts/[id]/route.ts
Check: canManageEvents() used for all handlers (not canWrite())
Fail if: canWrite() is present — that would allow Admin access

Read: components/Navigation.tsx
Check: LinkedIn Campaigns nav entry includes roles: [Roles.Root, Roles.Marketing]
Fail if: roles array is missing or includes Roles.Admin
```

### Step 7: Report
Output:
- ✅ PASS or ❌ FAIL for each step
- For failures: file path and line number
- Summary: "N/7 checks passed"
