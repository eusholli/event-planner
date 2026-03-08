# RBAC Audit & Remediation Design

**Date**: 2026-03-08
**Branch**: multi-event
**Status**: Approved

## Overview

Audit of the existing RBAC implementation against the defined role policy, followed by remediation using a `withAuth` route wrapper pattern and a repo-level RBAC verification skill.

## Role Policy

| Role | Scope | Capabilities |
|------|-------|-------------|
| `root` | System | Full CRUD on everything: system settings, events, attendees, companies, rooms, meetings |
| `marketing` | Global (no system) | Full CRUD on all events, event settings, attendees, companies, rooms, meetings |
| `admin` | Per-event | Full CRUD on assigned events and their attendees, companies, rooms, meetings |
| `user` | Per-event | Read-only on assigned events; CRUD only on meetings they personally created |

**Shared resources**: Attendees and companies are system-level shared records — any authenticated user (all 4 roles) has full CRUD access.

**AI Chat**: Any authenticated user with event access can use OpenClaw Insights chat.

## Confirmed Bugs Found in Audit

1. `canCreate()` in `lib/role-utils.ts` excludes `marketing` — should include it
2. Admin writes are not event-scoped — `canWrite()` alone does not verify `hasEventAccess()`
3. Most GET endpoints have no auth check at all (meetings, rooms, attendees, ROI, etc.)
4. `DELETE /api/settings/delete-data` has zero auth (critical — allows unauthenticated data deletion)
5. `POST /api/settings/import` has no auth check
6. `GET /api/settings` exposes system settings without auth
7. `/api/chat` is publicly accessible (no auth)
8. `POST /api/meetings/[id]/invite`, `POST /api/meetings/check-availability`, `GET /api/attendees/autocomplete`, briefing endpoints — all unprotected

## Permission Helper Corrections

| Helper | Root | Marketing | Admin | User |
|--------|------|-----------|-------|------|
| `isAuthenticated` | ✓ | ✓ | ✓ | ✓ |
| `canWrite` | ✓ | ✓ | ✓ | — |
| `canCreate` | ✓ | ✓ | ✓ | ✓ |
| `canManageEvents` | ✓ | ✓ | — | — |
| `isRootUser` | ✓ | — | — | — |
| `hasEventAccess` | ✓ (global) | ✓ (global) | assigned only | assigned only |

**Fix**: Add `marketing` to `canCreate()` in `lib/role-utils.ts`.

## Chosen Approach: Route-level Auth Wrappers (Option B)

Create `lib/with-auth.ts` exporting a `withAuth(handler, options)` wrapper. Each route declares its requirements; the wrapper enforces them before the handler runs.

### `withAuth` Options

```typescript
type AuthOptions = {
  requireAuth?: boolean           // default: true — any logged-in user
  requireRole?: 'root' | 'write' | 'create' | 'manageEvents'
  requireEventAccess?: boolean    // fetch event from DB + check hasEventAccess()
  eventIdParam?: string           // route param holding event id (default: 'id')
  allowOwner?: boolean            // also allow if user is resource owner (meeting edit/delete)
}
```

The wrapper injects `{ userId, role, event? }` as context into the handler, returns 401 if unauthenticated, 403 if unauthorized.

### Usage Pattern

```typescript
export const GET = withAuth(handler, { requireEventAccess: true })
export const POST = withAuth(handler, { requireRole: 'create', requireEventAccess: true })
export const DELETE = withAuth(handler, { requireRole: 'root' })
```

## Route Policy Table

### System Settings
| Route | Method | Auth Options |
|-------|--------|-------------|
| `/api/settings` | GET | `requireRole: 'root'` |
| `/api/settings` | POST | `requireRole: 'root'` |
| `/api/settings/export` | GET | `requireRole: 'root'` |
| `/api/settings/import` | POST | `requireRole: 'root'` |
| `/api/settings/delete-data` | DELETE | `requireRole: 'root'` |

### Events
| Route | Method | Auth Options |
|-------|--------|-------------|
| `/api/events` | GET | `requireAuth: true` (filtered by role in handler) |
| `/api/events` | POST | `requireRole: 'manageEvents'` |
| `/api/events/[id]` | GET | `requireEventAccess: true` |
| `/api/events/[id]` | PATCH | `requireRole: 'manageEvents'` |
| `/api/events/[id]` | DELETE | `requireRole: 'manageEvents'` |
| `/api/events/[id]/roi` | GET | `requireEventAccess: true` |
| `/api/events/[id]/roi` | PUT/POST | `requireRole: 'write', requireEventAccess: true` |
| `/api/events/[id]/export` | GET | `requireRole: 'write', requireEventAccess: true` |
| `/api/events/[id]/import` | POST | `requireRole: 'write', requireEventAccess: true` |
| `/api/events/[id]/reset` | POST | `requireRole: 'write', requireEventAccess: true` |

### Meetings
| Route | Method | Auth Options |
|-------|--------|-------------|
| `/api/meetings` | GET | `requireEventAccess: true` |
| `/api/meetings` | POST | `requireRole: 'create', requireEventAccess: true` |
| `/api/meetings/[id]` | GET | `requireEventAccess: true` |
| `/api/meetings/[id]` | PUT | `requireRole: 'write', requireEventAccess: true, allowOwner: true` |
| `/api/meetings/[id]` | DELETE | `requireRole: 'write', requireEventAccess: true, allowOwner: true` |
| `/api/meetings/[id]/email` | POST | `requireRole: 'write', requireEventAccess: true` |
| `/api/meetings/[id]/invite` | GET/POST | `requireRole: 'write', requireEventAccess: true` |
| `/api/meetings/check-availability` | POST | `requireEventAccess: true` |

### Rooms
| Route | Method | Auth Options |
|-------|--------|-------------|
| `/api/rooms` | GET | `requireEventAccess: true` |
| `/api/rooms` | POST | `requireRole: 'write', requireEventAccess: true` |
| `/api/rooms/[id]` | PUT | `requireRole: 'write', requireEventAccess: true` |
| `/api/rooms/[id]` | DELETE | `requireRole: 'write', requireEventAccess: true` |
| `/api/rooms/[id]/briefing` | GET | `requireEventAccess: true` |

### Attendees & Companies (any authenticated user)
| Route | Method | Auth Options |
|-------|--------|-------------|
| `/api/attendees` | GET/POST | `requireAuth: true` |
| `/api/attendees/[id]` | GET/PUT/DELETE | `requireAuth: true` |
| `/api/attendees/[id]/briefing` | GET | `requireAuth: true` |
| `/api/attendees/autocomplete` | POST | `requireAuth: true` |
| `/api/companies` | GET/POST | `requireAuth: true` |
| `/api/companies/[id]` | GET/PUT/DELETE | `requireAuth: true` |

### Admin & Chat
| Route | Method | Auth Options |
|-------|--------|-------------|
| `/api/admin/users` | GET/POST/DELETE | `requireRole: 'manageEvents'` |
| `/api/admin/system/*` | all | `requireRole: 'root'` |
| `/api/chat` | POST | `requireEventAccess: true` |
| `/api/chat/status` | GET | `requireAuth: true` |
| `/api/image-proxy` | GET | `requireAuth: true` |
| `/api/user/init` | POST | `requireAuth: true` |

## RBAC Verification Skill

A skill file at `.claude/skills/rbac-check.md` is committed into the repo and version-controlled alongside the code it guards.

**Trigger**: `/rbac-check` after any code change touching API routes or auth helpers.

**Checks performed**:
1. **Coverage** — every route file exporting HTTP handlers must use `withAuth`
2. **Policy conformance** — declared `withAuth` options match the policy table above
3. **`canCreate`/`canWrite` correctness** — verify `lib/role-utils.ts` includes `marketing` in `canCreate`
4. **`allowOwner` scope** — verify `allowOwner: true` only appears on meeting PUT/DELETE

The skill embeds the canonical policy table as reference so it can audit without querying the codebase each time.
