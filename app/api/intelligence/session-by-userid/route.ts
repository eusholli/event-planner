// app/api/intelligence/session-by-userid/route.ts
//
// Sibling of /api/intelligence/session that mints an action token from a
// Clerk userId directly (without requiring a Clerk JWT). Used by viber-proxy,
// which receives Viber webhooks and has no Clerk session to verify.
//
// Auth: CRON_SECRET_KEY Bearer (same as /api/intelligence/session).
import { NextResponse } from 'next/server'
import { createClerkClient } from '@clerk/backend'
import { signActionToken, ACTION_TOKEN_TTL_MS } from '@/lib/action-tokens'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function validateCronSecret(req: Request): boolean {
    const secret = process.env.CRON_SECRET_KEY
    if (!secret) return false
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    return token === secret && token.length > 0
}

export async function POST(req: Request) {
    if (!validateCronSecret(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { clerkUserId?: string; eventId?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { clerkUserId, eventId } = body
    if (!clerkUserId) {
        return NextResponse.json({ error: 'clerkUserId required' }, { status: 400 })
    }

    try {
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
        const user = await clerk.users.getUser(clerkUserId)
        const role = (user.publicMetadata?.role as string) ?? 'user'
        const email = user.emailAddresses[0]?.emailAddress ?? ''
        const actionToken = signActionToken(clerkUserId, role, email)

        let eventSlug: string | null = null
        if (eventId) {
            const event = await prisma.event.findFirst({
                where: { OR: [{ id: eventId }, { slug: eventId }] },
                select: { slug: true },
            })
            eventSlug = event?.slug ?? null
        }

        return NextResponse.json({
            actionToken,
            userId: clerkUserId,
            role,
            email,
            expiresAt: new Date(Date.now() + ACTION_TOKEN_TTL_MS).toISOString(),
            ...(eventSlug && { eventSlug }),
        })
    } catch (err) {
        console.error('[session-by-userid] error:', err)
        return NextResponse.json({ error: 'Clerk lookup failed' }, { status: 404 })
    }
}
