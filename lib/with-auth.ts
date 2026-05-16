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

type NextRouteHandler = (
    req: Request,
    ctx: { params: Promise<Record<string, string>> }
) => Promise<Response>

function getRole(sessionClaims: Record<string, unknown> | null): string {
    return (sessionClaims?.metadata as Record<string, unknown>)?.role as string ?? ''
}

function getUserId(clerkUserId: string | null): string {
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

export function withAuth(handler: RouteHandler, options: AuthOptions = {}): NextRouteHandler {
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
            // Skip event access check in mock/disabled auth mode — mock user is root with global access
            if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
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
