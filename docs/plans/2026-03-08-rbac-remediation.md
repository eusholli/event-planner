# RBAC Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all RBAC bugs and gaps identified in the audit by implementing a `withAuth` route wrapper, correcting the `canCreate` helper, and adding a repo-level RBAC verification skill.

**Architecture:** A `withAuth(handler, options)` wrapper in `lib/with-auth.ts` wraps every Next.js App Router route handler. It resolves auth once per request, injects `{ userId, role, event? }` as `authCtx` into the handler's context object, and returns 401/403 before the handler runs if checks fail. The wrapper supports path-param and query-param event ID resolution for `requireEventAccess`; item routes (e.g. `GET /api/meetings/[id]`) receive `authCtx` and do their own event access check after looking up the resource.

**Tech Stack:** Next.js 15 App Router, TypeScript, Clerk (`@clerk/nextjs/server`), Prisma. No test framework beyond Playwright; verification is via `npm run build` + manual curl smoke tests.

**Design doc:** `docs/plans/2026-03-08-rbac-audit-design.md`

---

## Task 1: Fix `canCreate` to include `marketing`

**Files:**
- Modify: `lib/role-utils.ts`

**Step 1: Apply the fix**

In `lib/role-utils.ts`, change `hasCreateAccess` from:
```typescript
export const hasCreateAccess = (role?: string) => {
    return role === Roles.Root || role === Roles.Admin || role === Roles.User
}
```
To:
```typescript
export const hasCreateAccess = (role?: string) => {
    return role === Roles.Root || role === Roles.Marketing || role === Roles.Admin || role === Roles.User
}
```

**Step 2: Verify build passes**
```bash
npm run build
```
Expected: no TypeScript errors.

**Step 3: Commit**
```bash
git add lib/role-utils.ts
git commit -m "fix: add marketing to canCreate access check"
```

---

## Task 2: Create `lib/with-auth.ts` wrapper

**Files:**
- Create: `lib/with-auth.ts`

**Step 1: Create the file**

```typescript
import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { Roles } from './constants'
import { hasWriteAccess, canManageEvents, hasCreateAccess } from './role-utils'
import { hasEventAccess } from './access'
import prisma from './prisma'

export type AuthContext = {
    userId: string
    role: string
    event?: {
        id: string
        authorizedUserIds: string[]
        status: string
        [key: string]: unknown
    }
}

type AuthOptions = {
    /** Require any authenticated user (default: true) */
    requireAuth?: boolean
    /** Require a specific capability level */
    requireRole?: 'root' | 'write' | 'create' | 'manageEvents'
    /** Also verify hasEventAccess; set eventIdSource to control how eventId is resolved */
    requireEventAccess?: boolean
    /** Where to find the event ID: 'param' = path param (default), 'query' = query string */
    eventIdSource?: 'param' | 'query'
    /** Path param name when eventIdSource='param' (default: 'id') */
    eventIdParam?: string
    /** Query param name when eventIdSource='query' (default: 'eventId') */
    eventIdQueryParam?: string
}

type RouteContext = {
    params: Promise<Record<string, string>>
    authCtx: AuthContext
}

type RouteHandler = (
    req: Request,
    ctx: RouteContext
) => Promise<Response>

function getRole(sessionClaims: Record<string, unknown> | null): string {
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
        return Roles.Root
    }
    return (sessionClaims?.metadata as Record<string, unknown>)?.role as string ?? ''
}

function getUserId(clerkUserId: string | null): string {
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
        return 'mock-root-user'
    }
    return clerkUserId ?? ''
}

function roleHasCapability(role: string, requireRole: AuthOptions['requireRole']): boolean {
    switch (requireRole) {
        case 'root': return role === Roles.Root
        case 'write': return hasWriteAccess(role)
        case 'create': return hasCreateAccess(role)
        case 'manageEvents': return canManageEvents(role)
        default: return true
    }
}

export function withAuth(handler: RouteHandler, options: AuthOptions = {}): RouteHandler {
    const {
        requireAuth = true,
        requireRole,
        requireEventAccess = false,
        eventIdSource = 'param',
        eventIdParam = 'id',
        eventIdQueryParam = 'eventId',
    } = options

    return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
        // ── 1. Resolve identity ──────────────────────────────────────────────
        let userId = ''
        let role = ''

        if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
            userId = 'mock-root-user'
            role = Roles.Root
        } else {
            const { userId: clerkUserId, sessionClaims } = await auth()
            if (requireAuth && !clerkUserId) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }
            userId = getUserId(clerkUserId)
            role = getRole(sessionClaims as Record<string, unknown> | null)
        }

        // ── 2. Role capability check ─────────────────────────────────────────
        if (requireRole && !roleHasCapability(role, requireRole)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // ── 3. Event access check ────────────────────────────────────────────
        let event: AuthContext['event'] | undefined

        if (requireEventAccess) {
            let rawEventId: string | null = null

            if (eventIdSource === 'param') {
                const resolvedParams = await ctx.params
                rawEventId = resolvedParams[eventIdParam] ?? null
            } else {
                rawEventId = new URL(req.url).searchParams.get(eventIdQueryParam)
            }

            if (!rawEventId) {
                return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
            }

            // Resolve slug or UUID
            const resolvedEvent = await prisma.event.findFirst({
                where: { OR: [{ id: rawEventId }, { slug: rawEventId }] },
                select: { id: true, authorizedUserIds: true, status: true, slug: true, name: true },
            })

            if (!resolvedEvent) {
                return NextResponse.json({ error: 'Event not found' }, { status: 404 })
            }

            if (!hasEventAccess(resolvedEvent, userId, role)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }

            event = resolvedEvent
        }

        // ── 4. Inject auth context and call handler ──────────────────────────
        const authCtx: AuthContext = { userId, role, event }
        return handler(req, { ...ctx, authCtx })
    }
}

/**
 * Convenience: check if request user owns the resource (for user-role meeting edit/delete).
 * Usage: const allowed = await isOwnerOrCanWrite(authCtx, meeting.createdBy)
 */
export async function isOwnerOrCanWrite(
    authCtx: AuthContext,
    resourceOwnerEmail: string | null
): Promise<boolean> {
    if (hasWriteAccess(authCtx.role)) return true

    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') return true

    const user = await currentUser()
    const userEmail = user?.emailAddresses[0]?.emailAddress
    return userEmail === resourceOwnerEmail
}
```

**Step 2: Verify build**
```bash
npm run build
```
Expected: no errors.

**Step 3: Commit**
```bash
git add lib/with-auth.ts
git commit -m "feat: add withAuth route wrapper for centralized RBAC enforcement"
```

---

## Task 3: Secure `/api/settings/*` routes (critical)

**Files:**
- Modify: `app/api/settings/route.ts`
- Modify: `app/api/settings/export/route.ts`
- Modify: `app/api/settings/import/route.ts`
- Modify: `app/api/settings/delete-data/route.ts`

**Step 1: Read each file before editing**

Read all four files to understand existing handler structure.

**Step 2: Wrap `app/api/settings/route.ts`**

Wrap both GET and POST handlers with `withAuth(handler, { requireRole: 'root' })`.

Pattern to follow — replace:
```typescript
export async function GET(request: Request) {
    // existing body
}

export async function POST(request: Request) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // existing body
}
```

With:
```typescript
import { withAuth } from '@/lib/with-auth'

const getHandler = withAuth(async (request, { authCtx }) => {
    // existing body (remove any internal auth checks)
}, { requireRole: 'root' })

const postHandler = withAuth(async (request, { authCtx }) => {
    // existing body (remove the canWrite() check at top)
}, { requireRole: 'root' })

export const GET = getHandler
export const POST = postHandler
```

**Step 3: Wrap `app/api/settings/export/route.ts`**

The existing export route has a `BACKUP_SECRET_KEY` bypass. Keep that logic but add a root check for non-backup requests:

```typescript
import { withAuth, AuthContext } from '@/lib/with-auth'
import { auth } from '@clerk/nextjs/server'

// The export route has a special BACKUP_SECRET_KEY bypass path.
// We handle this by checking the header first before the wrapper runs.
export async function GET(request: Request, ctx: { params: Promise<Record<string, string>> }) {
    const backupKey = request.headers.get('x-backup-key') || request.headers.get('authorization')?.replace('Bearer ', '')
    if (backupKey && backupKey === process.env.BACKUP_SECRET_KEY) {
        // Bypass auth for backup automation
        return settingsExportHandler(request)
    }
    // Otherwise require root
    return withAuth(
        async (req) => settingsExportHandler(req),
        { requireRole: 'root' }
    )(request, ctx)
}
```

Note: Read the existing file first and adapt to its actual structure. The key change is adding `requireRole: 'root'` for non-backup callers.

**Step 4: Wrap `app/api/settings/import/route.ts`**

Add `requireRole: 'root'` via `withAuth`. Remove any existing (missing) auth checks.

**Step 5: Wrap `app/api/settings/delete-data/route.ts`**

This is the critical one — no auth at all currently. Add `requireRole: 'root'`.

**Step 6: Build and verify**
```bash
npm run build
```

**Step 7: Smoke test (with auth disabled)**
```bash
NEXT_PUBLIC_DISABLE_CLERK_AUTH=true npm run dev
# In another terminal:
curl -s http://localhost:3000/api/settings | head -c 200
# Should return settings data (mock root user bypasses auth)
```

**Step 8: Commit**
```bash
git add app/api/settings/route.ts app/api/settings/export/route.ts \
        app/api/settings/import/route.ts app/api/settings/delete-data/route.ts
git commit -m "fix: enforce root-only auth on all /api/settings/* routes"
```

---

## Task 4: Secure `/api/events/*` routes

**Files:**
- Modify: `app/api/events/route.ts`
- Modify: `app/api/events/[id]/route.ts`
- Modify: `app/api/events/[id]/roi/route.ts`
- Modify: `app/api/events/[id]/export/route.ts`
- Modify: `app/api/events/[id]/import/route.ts`
- Modify: `app/api/events/[id]/reset/route.ts`

**Step 1: Read all six files**

**Step 2: Update `app/api/events/route.ts`**

- `GET`: already filters by role in handler body. Add `requireAuth: true` wrapper to ensure the user is logged in before reaching that logic. Remove any existing auth code at the top of GET.
- `POST`: already has `canManageEvents()`. Replace with `withAuth(handler, { requireRole: 'manageEvents' })` and remove the internal check.

**Step 3: Update `app/api/events/[id]/route.ts`**

- `GET`: Add `withAuth(handler, { requireEventAccess: true })`. eventId is path param `id` (default). Remove any existing auth check.
- `PATCH`: Replace existing `canManageEvents()` check with `withAuth(handler, { requireRole: 'manageEvents' })`.
- `DELETE`: Replace existing `canManageEvents()` check with `withAuth(handler, { requireRole: 'manageEvents' })`.

**Step 4: Update `app/api/events/[id]/roi/route.ts`**

- `GET`: Add `withAuth(handler, { requireEventAccess: true })`.
- `PUT` (save targets): Replace `canWrite()` with `withAuth(handler, { requireRole: 'write', requireEventAccess: true })`.
- `POST` (submit/approve/reject): This route has different logic per action. Wrap with `withAuth(handler, { requireRole: 'write', requireEventAccess: true })` for the baseline, keeping internal `isRootUser()` check for approve/reject actions (those need stricter role inside the handler).

**Step 5: Update export/import/reset routes under `/api/events/[id]/`**

Each has a `canWrite()` check. Replace with:
```typescript
withAuth(handler, { requireRole: 'write', requireEventAccess: true })
```
Remove the internal `canWrite()` call.

**Step 6: Build and verify**
```bash
npm run build
```

**Step 7: Commit**
```bash
git add app/api/events/
git commit -m "fix: add withAuth wrappers to all /api/events/* routes"
```

---

## Task 5: Secure `/api/meetings/*` routes

**Files:**
- Modify: `app/api/meetings/route.ts`
- Modify: `app/api/meetings/[id]/route.ts`
- Modify: `app/api/meetings/[id]/email/route.ts`
- Modify: `app/api/meetings/[id]/invite/route.ts`
- Modify: `app/api/meetings/check-availability/route.ts`

**Step 1: Read all five files**

**Step 2: Update `app/api/meetings/route.ts`**

- `GET`: Event ID comes from query param `?eventId=`. Add:
  ```typescript
  withAuth(handler, {
      requireEventAccess: true,
      eventIdSource: 'query',
      eventIdQueryParam: 'eventId',
  })
  ```
  The handler already calls `resolveEventId(rawEventId)` — keep that. The wrapper will independently verify event access using the same query param.

- `POST`: Replace `canCreate()` check with:
  ```typescript
  withAuth(handler, {
      requireRole: 'create',
      requireEventAccess: true,
      eventIdSource: 'query',   // eventId in body, but also must be in query for wrapper
  })
  ```
  **Note**: POST body contains `eventId`, not query param. For the wrapper's event access check, the eventId needs to be accessible at wrapper time. Two options:
  - **(Preferred)**: Require the caller to also send `eventId` as query param on POST, OR
  - Read body in wrapper (not ideal — body can only be consumed once)

  **Resolution**: Add `eventIdSource: 'body-field'` support is too complex. Instead, for POST meetings, add the `hasEventAccess` check inside the handler after resolving eventId from the body, using `authCtx` provided by a simpler wrapper:
  ```typescript
  const postHandler = withAuth(async (req, { authCtx }) => {
      // existing body...
      const eventId = await resolveEventId(rawEventId)
      // Add event access check:
      const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, authorizedUserIds: true, status: true } })
      if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      // rest of handler...
  }, { requireRole: 'create' })
  ```

**Step 3: Update `app/api/meetings/[id]/route.ts`**

For all three methods (GET, PUT, DELETE), the meeting ID is in path params but the eventId must be derived from the meeting record. Use a simpler wrapper that just provides `authCtx`:

- `GET`:
  ```typescript
  const getHandler = withAuth(async (req, { params, authCtx }) => {
      const id = (await params).id
      const meeting = await prisma.meeting.findUnique({ where: { id }, include: { room: true, attendees: true } })
      if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

      // Check event access
      if (meeting.eventId) {
          const event = await prisma.event.findUnique({ where: { id: meeting.eventId }, select: { id: true, authorizedUserIds: true, status: true } })
          if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
              return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
      }
      return NextResponse.json(meeting)
  }, { requireAuth: true })
  ```

- `PUT` and `DELETE`: Replace the ad-hoc `canWrite()` + ownership check with `isOwnerOrCanWrite` from `lib/with-auth.ts`:
  ```typescript
  import { withAuth, isOwnerOrCanWrite } from '@/lib/with-auth'
  import { hasEventAccess } from '@/lib/access'

  const putHandler = withAuth(async (req, { params, authCtx }) => {
      const id = (await params).id
      const meeting = await prisma.meeting.findUnique({ where: { id } })
      if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

      // Event access check
      if (meeting.eventId) {
          const event = await prisma.event.findUnique({ where: { id: meeting.eventId }, select: { id: true, authorizedUserIds: true, status: true } })
          if (!event || !hasEventAccess(event, authCtx.userId, authCtx.role)) {
              return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
      }

      // Owner/write check
      if (!await isOwnerOrCanWrite(authCtx, meeting.createdBy)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // existing update logic...
  }, { requireAuth: true })
  ```

**Step 4: Update `app/api/meetings/[id]/email/route.ts` and `invite/route.ts`**

Read files first. Replace `checkRole()` checks with:
```typescript
withAuth(handler, { requireRole: 'write', requireEventAccess: true, eventIdSource: 'query' })
```
If eventId is not in the query string, check the handler to see how the meeting's event is accessed, and do the event access check inside the handler using `authCtx`.

**Step 5: Update `app/api/meetings/check-availability/route.ts`**

Read file. The eventId is likely in the request body or query. Add `withAuth(handler, { requireAuth: true })` at minimum, then add event access check inside the handler using `authCtx`.

**Step 6: Build and verify**
```bash
npm run build
```

**Step 7: Commit**
```bash
git add app/api/meetings/
git commit -m "fix: add withAuth wrappers and event access checks to all /api/meetings/* routes"
```

---

## Task 6: Secure `/api/rooms/*` routes

**Files:**
- Modify: `app/api/rooms/route.ts`
- Modify: `app/api/rooms/[id]/route.ts`
- Modify: `app/api/rooms/[id]/briefing/route.ts`

**Step 1: Read all three files**

**Step 2: Update `app/api/rooms/route.ts`**

- `GET`: Event ID likely in query param. Add:
  ```typescript
  withAuth(handler, { requireEventAccess: true, eventIdSource: 'query' })
  ```
- `POST`: Replace `canWrite()` with `withAuth(handler, { requireRole: 'write' })`, then add event access check inside handler using `authCtx`.

**Step 3: Update `app/api/rooms/[id]/route.ts`**

Similar to meetings item route — room's eventId must be looked up from the DB. Use `withAuth(handler, { requireAuth: true })` and add event access check in handler body. Replace `canWrite()` with `isOwnerOrCanWrite` equivalent or direct `hasWriteAccess(authCtx.role)` check.

**Step 4: Update `app/api/rooms/[id]/briefing/route.ts`**

Add `withAuth(handler, { requireAuth: true })`. Derive event from room record and call `hasEventAccess` in handler.

**Step 5: Build and verify**
```bash
npm run build
```

**Step 6: Commit**
```bash
git add app/api/rooms/
git commit -m "fix: add withAuth wrappers to all /api/rooms/* routes"
```

---

## Task 7: Secure `/api/attendees/*` and `/api/companies/*` (any authenticated user)

**Files:**
- Modify: `app/api/attendees/route.ts`
- Modify: `app/api/attendees/[id]/route.ts`
- Modify: `app/api/attendees/[id]/briefing/route.ts`
- Modify: `app/api/attendees/autocomplete/route.ts`
- Modify: `app/api/companies/route.ts`
- Modify: `app/api/companies/[id]/route.ts`

**Step 1: Read all six files**

**Step 2: Policy — any authenticated user, all methods**

Every handler in all six files gets:
```typescript
withAuth(handler, { requireAuth: true })
```

Remove all existing `canWrite()`, `canManageEvents()` checks (these were over-restricting the `user` role which should have full CRUD on attendees/companies).

The one exception: `DELETE /api/companies/[id]` currently requires `canManageEvents()`. Per the new policy (any authenticated user = full CRUD on shared resources), this changes to `requireAuth: true`. Confirm this is intentional before removing.

**Step 3: Apply wrappers to all files**

For each file, wrap each exported method handler with `withAuth(handler, { requireAuth: true })`.

**Step 4: Build and verify**
```bash
npm run build
```

**Step 5: Commit**
```bash
git add app/api/attendees/ app/api/companies/
git commit -m "fix: open attendees and companies to all authenticated users (shared resources)"
```

---

## Task 8: Secure `/api/admin/*`, `/api/chat/*`, and misc routes

**Files:**
- Modify: `app/api/admin/users/route.ts` (already correct — verify)
- Modify: `app/api/admin/system/route.ts` (already correct — verify)
- Modify: `app/api/admin/system/export/route.ts`
- Modify: `app/api/admin/system/import/route.ts`
- Modify: `app/api/admin/system/reset/route.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/chat/status/route.ts`
- Modify: `app/api/image-proxy/route.ts`

**Step 1: Read all files**

**Step 2: Admin routes**

`/api/admin/users` and `/api/admin/system` routes already have auth checks. Replace their internal `checkRole()` / `isRootUser()` calls with `withAuth` wrappers:
- `admin/users`: `withAuth(handler, { requireRole: 'manageEvents' })`
- `admin/system/*`: `withAuth(handler, { requireRole: 'root' })`

**Step 3: Chat routes**

`/api/chat` needs to verify the user has access to the event they're chatting about. The chat route likely receives an eventId. Add:
```typescript
withAuth(handler, {
    requireEventAccess: true,
    eventIdSource: 'query',  // or 'body' — check actual implementation
})
```
Read the route file first to determine how eventId is passed, then do event access check accordingly.

`/api/chat/status`: Add `withAuth(handler, { requireAuth: true })`.

**Step 4: Image proxy**

Add `withAuth(handler, { requireAuth: true })` to prevent open proxy abuse.

**Step 5: Build and verify**
```bash
npm run build
```

**Step 6: Commit**
```bash
git add app/api/admin/ app/api/chat/ app/api/image-proxy/
git commit -m "fix: add withAuth wrappers to admin, chat, and image-proxy routes"
```

---

## Task 9: Create RBAC verification skill

**Files:**
- Create: `.claude/skills/rbac-check.md`

**Step 1: Create the `.claude/skills/` directory if it doesn't exist**
```bash
mkdir -p .claude/skills
```

**Step 2: Create the skill file**

```markdown
---
name: rbac-check
description: Audit API routes for RBAC correctness after any code change. Checks coverage, policy conformance, and helper correctness.
triggers:
  - after modifying any file in app/api/
  - after modifying lib/with-auth.ts, lib/role-utils.ts, or lib/access.ts
---

# RBAC Verification Checklist

Run this skill after any change to API routes or auth helpers to verify RBAC correctness.

## Canonical Policy

### Permission Helpers (lib/role-utils.ts)
- `hasWriteAccess`: Root | Marketing | Admin
- `hasCreateAccess`: Root | Marketing | Admin | User  ← Marketing MUST be included
- `canManageEvents`: Root | Marketing
- `isRootUser`: Root only

### Route Policy

| Route pattern | GET | POST | PUT/PATCH | DELETE |
|--------------|-----|------|-----------|--------|
| /api/settings/* | root | root | root | root |
| /api/events | auth | manageEvents | — | — |
| /api/events/[id] | eventAccess | — | manageEvents | manageEvents |
| /api/events/[id]/roi | eventAccess | write+eventAccess | write+eventAccess | — |
| /api/events/[id]/export | write+eventAccess | — | — | — |
| /api/events/[id]/import | — | write+eventAccess | — | — |
| /api/events/[id]/reset | — | write+eventAccess | — | — |
| /api/meetings | eventAccess | create+eventAccess | — | — |
| /api/meetings/[id] | auth+eventAccess | — | write+eventAccess+owner | write+eventAccess+owner |
| /api/meetings/[id]/email | — | write+eventAccess | — | — |
| /api/meetings/[id]/invite | write+eventAccess | write+eventAccess | — | — |
| /api/meetings/check-availability | — | eventAccess | — | — |
| /api/rooms | eventAccess | write+eventAccess | — | — |
| /api/rooms/[id] | auth+eventAccess | — | write+eventAccess | write+eventAccess |
| /api/rooms/[id]/briefing | auth+eventAccess | — | — | — |
| /api/attendees/* | auth | auth | auth | auth |
| /api/companies/* | auth | auth | auth | auth |
| /api/admin/users | manageEvents | manageEvents | — | manageEvents |
| /api/admin/system/* | root | root | — | — |
| /api/chat | eventAccess | eventAccess | — | — |
| /api/chat/status | auth | — | — | — |
| /api/image-proxy | auth | — | — | — |
| /api/user/init | — | auth | — | — |

Legend: `auth` = any authenticated user, `eventAccess` = auth + hasEventAccess, `owner` = also allow if user owns the resource (meeting createdBy)

## Audit Steps

### Step 1: Coverage check
Search for all route files that export HTTP handlers without withAuth:

```
Grep for files in app/api/**/*.ts that export `async function GET/POST/PUT/PATCH/DELETE`
but do NOT import from `@/lib/with-auth`
```

Flag any such file as a coverage gap.

### Step 2: canCreate includes marketing
Read `lib/role-utils.ts`. Verify `hasCreateAccess` includes `Roles.Marketing`.
Fail if `Roles.Marketing` is absent from that function.

### Step 3: allowOwner scope
Search for `allowOwner` or `isOwnerOrCanWrite` across all route files.
It must appear ONLY in:
- `app/api/meetings/[id]/route.ts` (PUT and DELETE handlers)

Flag any other occurrence as a policy violation.

### Step 4: Settings routes are root-only
Read all files in `app/api/settings/`. Verify every exported handler uses
`withAuth` with `requireRole: 'root'` OR is the backup key bypass path.

### Step 5: Report
Output:
- PASS or FAIL for each step
- For failures: file path and line number of the violation
- Summary count: N checks passed, M failed
```

**Step 3: Verify the skill file is well-formed**

Check that it renders cleanly:
```bash
cat .claude/skills/rbac-check.md
```

**Step 4: Commit**
```bash
git add .claude/skills/rbac-check.md
git commit -m "feat: add rbac-check skill for post-change RBAC verification"
```

---

## Task 10: Full build + smoke test

**Step 1: Run full build**
```bash
npm run build
```
Expected: exits 0 with no TypeScript errors.

**Step 2: Run dev server and smoke test protected routes**
```bash
npm run dev
```

In a second terminal (auth disabled mode):
```bash
# Should work — any auth is mock root
curl -s http://localhost:3000/api/meetings?eventId=<any-event-id> | head -c 100

# Should work — root has settings access
curl -s http://localhost:3000/api/settings | head -c 100
```

With auth enabled (requires a non-root test user), verify:
- A `user`-role request to `DELETE /api/settings/delete-data` returns 403
- A `user`-role request to `GET /api/meetings?eventId=<unassigned-event>` returns 403

**Step 3: Run RBAC skill**
```
/rbac-check
```
Expected: all steps pass.

**Step 4: Final commit if any cleanup needed**
```bash
git add -A
git commit -m "fix: RBAC remediation complete — all routes secured per policy"
```
