// app/api/viber/lookup/route.ts
//
// Server-to-server (CRON_SECRET_KEY Bearer): viber-proxy resolves a Viber
// sender ID to a Clerk identity + role on every inbound message.
import { NextResponse } from 'next/server'
import { createClerkClient } from '@clerk/backend'
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

    let body: { viberUserId?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.viberUserId) {
        return NextResponse.json({ error: 'viberUserId required' }, { status: 400 })
    }

    const link = await prisma.viberUser.findUnique({ where: { viberUserId: body.viberUserId } })
    if (!link) {
        return NextResponse.json({ linked: false })
    }

    let role = 'user'
    let clerkName = link.viberName
    try {
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
        const user = await clerk.users.getUser(link.clerkUserId)
        role = (user.publicMetadata?.role as string) ?? 'user'
        clerkName = [user.firstName, user.lastName].filter(Boolean).join(' ') ||
            user.emailAddresses[0]?.emailAddress || link.viberName
    } catch (err) {
        console.warn('[viber/lookup] Failed to fetch Clerk user:', err)
    }

    return NextResponse.json({
        linked: true,
        clerkUserId: link.clerkUserId,
        clerkName,
        role,
    })
}
