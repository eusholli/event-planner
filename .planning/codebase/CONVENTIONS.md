# Coding Conventions

**Analysis Date:** 2026-03-17

## Naming Patterns

**Files:**
- API routes: `route.ts` in directory matching the endpoint path (e.g., `app/api/events/route.ts`, `app/api/events/[id]/route.ts`)
- React components: PascalCase with `.tsx` extension (e.g., `MetricCard.tsx`, `IntelligenceChat.tsx`)
- Utilities/libraries: camelCase with `.ts` extension (e.g., `prisma.ts`, `with-auth.ts`, `access.ts`)
- Type/interface files: Mixed naming; separate from implementations (e.g., `with-auth.ts` contains both `AuthContext` type and `withAuth` function)
- Subdirectories: kebab-case (e.g., `components/roi/`, `lib/tools/`)
- Test files: `*.spec.ts` (e.g., `tests/api/attendees.spec.ts`, `tests/e2e/events.spec.ts`)

**Functions:**
- Async handlers: camelCase with `Handler` suffix (e.g., `getHandler`, `postHandler`, `putHandler`, `deleteHandler`)
- Utility functions: camelCase, descriptive (e.g., `resolveEventId`, `hasEventAccess`, `geocodeAddress`, `createAttendeeTools`)
- Boolean checks: `can*`, `has*`, `is*` prefix (e.g., `canWrite`, `canManageEvents`, `hasEventAccess`, `isEventEditable`)
- Async operations: `*Op` suffix for data-layer operations (e.g., `getAttendeesOp`, `addAttendeeOp`, `checkAttendeeAvailabilityOp`)
- Tool creation: `create*Tools` pattern (e.g., `createAttendeeTools`, `createTools`)

**Variables:**
- Local variables: camelCase (e.g., `eventId`, `rawEventId`, `attendees`, `finalImageUrl`)
- Constants: camelCase or UPPER_SNAKE_CASE for environment-derived values
- Prefixes for variables holding raw/unresolved input: `raw*` (e.g., `rawEventId` before resolution to UUID)
- Loading/UI state: `*Loading` or `*LoadingId` for tracking (e.g., `sparkleLoadingId`, `loading`)

**Types:**
- Interfaces: PascalCase with `Props` or `Interface` suffix for components (e.g., `MetricCardProps`, `EventWithAccess`, `AuthContext`, `AuthOptions`, `RouteContext`)
- Enums: PascalCase, values are UPPER_SNAKE_CASE (e.g., `role === Roles.Root`)
- Type aliases: PascalCase (e.g., `PrismaClientSingleton`, `RouteHandler`)
- Zod schemas: camelCase variable names (e.g., `getAttendeesParameters`)

## Code Style

**Formatting:**
- ESLint with Next.js built-in config (`eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`)
- No explicit Prettier config file (uses ESLint defaults)
- 2-space indentation
- Semicolons required; enforced by ESLint

**Linting:**
- Run with `npm run lint`
- Config: `eslint.config.mjs` using new ESLint flat config format
- Next.js web vitals and TypeScript rules enabled
- Ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`

**Import organization:**

1. **External packages** (React, Next.js, third-party):
   - `import { something } from 'next/...'`
   - `import { something } from '@clerk/nextjs'`
   - `import { something } from '@/lib/...'` (path aliases)

2. **Path aliases:**
   - Use `@/` prefix for absolute imports from project root (e.g., `@/lib/prisma`, `@/components/auth`)
   - Avoids relative paths (`../../../`)

3. **Local/relative imports:**
   - Less common due to path aliases
   - When used: relative paths for sibling components

**Example from codebase** (`app/api/events/route.ts`):
```typescript
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, AuthContext } from '@/lib/with-auth'
import { Roles } from '@/lib/constants'
import { geocodeAddress } from '@/lib/geocoding'
```

## Error Handling

**Pattern:**
- Async handlers wrapped in try-catch blocks
- Catch logs error with `console.error()` providing context (e.g., `console.error('Error fetching events:', error)`)
- Returns `NextResponse.json({ error: 'message' }, { status: code })` for errors

**Status codes used:**
- `400` - Bad request (missing required fields, validation failure)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (insufficient permissions, read-only event)
- `404` - Not found (resource doesn't exist)
- `409` - Conflict (unique constraint violation, e.g., duplicate slug)
- `500` - Internal server error (unhandled exception)

**Example from `app/api/attendees/route.ts`:**
```typescript
async function postHandler(request: Request) {
    try {
        // ... logic
        if (!name || !title || !companyId || !email) {
            return NextResponse.json({ error: 'Name, Title, Company, and Email are required.' }, { status: 400 })
        }
        // ... more logic
        return NextResponse.json(attendee)
    } catch (error) {
        console.error('Create error:', error)
        return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 })
    }
}
```

## Logging

**Framework:** `console` (no external logging library in source code; Sentry handles production errors)

**Patterns:**
- `console.log()` - Informational messages (e.g., `'Processing uploaded file...'`, `'Created Event ID: ...'`)
- `console.error()` - Error context (e.g., `console.error('Error fetching events:', error)`)
- Always include a descriptive message before the error/object
- Used sparingly in API routes; more verbose in operational flows

**Example from `app/api/attendees/route.ts`:**
```typescript
console.log('Processing uploaded file...')
console.log('Processing URL import...')
console.error('Failed to import image from URL:', err)
console.error('Storage operation failed:', storageError)
```

## Comments

**When to comment:**
- Explain **why** not what (code should be self-documenting)
- Mark locking/access control checks with `// LOCK CHECK` or similar (e.g., in `app/api/attendees/route.ts`)
- Explain business logic that isn't obvious (e.g., cascade deletion behavior, event state transitions)
- Mark sections with dashes: `// ── 1. Description ──` (used in `lib/with-auth.ts`)

**JSDoc/TSDoc:**
- Used minimally; primarily for exported functions and types
- Interface properties include brief `.describe()` when using Zod schemas
- Example from `lib/tools/attendees.ts`:
```typescript
const getAttendeesParameters = z.object({
    search: z.string().optional().describe('Search term for name, title, email, company name, bio'),
    company: z.string().optional().describe('Filter by specific company name'),
});
```

**Avoid:**
- Redundant comments that restate code
- Commented-out code blocks (delete or document reason for keeping)

## Function Design

**Size:** Small, focused functions (most API handlers are 20-50 lines, utilities are 5-20 lines)

**Parameters:**
- API handlers: `(request: Request)` or `(request: Request, ctx: RouteContext)` when using `withAuth`
- Tool handlers: Use Zod schemas for validation; destructure parameters inline
- Utility functions: Named parameters preferred; use object destructuring for multiple params

**Return values:**
- API handlers: Always return `NextResponse.json()` with status code
- Tool handlers: Return data object or error object with `{ error: string }`
- Utility functions: Direct values or promises

**Example handler pattern** (`app/api/events/route.ts`):
```typescript
const GETHandler = withAuth(async (request, ctx) => {
    const authCtx = ctx.authCtx as AuthContext
    try {
        // ... logic
        return NextResponse.json(events)
    } catch (error) {
        console.error('Error fetching events:', error)
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }
}, { requireAuth: true })

export const GET = GETHandler as any
```

## Module Design

**Exports:**
- Each file typically exports one main function/component
- Barrel files used in `components/auth/index.tsx` to re-export multiple utilities
- Named exports for utilities, default exports for React components

**Barrel files:**
- `components/auth/index.tsx` - Re-exports Clerk mocks and Clerk functions
- No wildcard exports; explicit naming

**Example from `components/auth/index.tsx`:**
```typescript
export const useUser = () => { /* ... */ }
export const useAuth = () => { /* ... */ }
export const ClerkProvider = ({ children, ...props }: any) => { /* ... */ }
// ... other exports
```

**Singleton pattern:**
- Used for Prisma client (`lib/prisma.ts`) to prevent multiple connection pools in development
- Global caching with `globalForPrisma` variable

## Type Safety

- Explicit `type` and `interface` declarations throughout
- Generic types for reusable utilities (e.g., `TRouteContext`, `PrismaClientSingleton`)
- `as any` casts used sparingly and only where type complexity prevents better typing (e.g., export handler casts in API routes)
- Zod for runtime validation of AI tool inputs

## Dynamic Imports

Used for conditional feature loading:
```typescript
const { uploadImageToR2, fetchAndUploadImageToR2 } = await import('@/lib/storage')
const { isEventEditable } = await import('@/lib/events')
```

Reduces bundle size by loading storage/event utils only when needed in POST handler.

---

*Convention analysis: 2026-03-17*
