// app/api/viber/link/redeem/route.ts
//
// Server-to-server (CRON_SECRET_KEY Bearer): viber-proxy calls this when a
// Viber user starts a conversation with `context=<code>`. We consume the code
// and persist the (viberUserId -> clerkUserId) mapping.
import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
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

    let body: { code?: string; viberUserId?: string; viberName?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { code, viberUserId, viberName } = body
    if (!code || !viberUserId) {
        return NextResponse.json({ error: 'code and viberUserId required' }, { status: 400 })
    }

    const linkCode = await prisma.viberLinkCode.findUnique({ where: { code } })
    if (!linkCode || linkCode.consumedAt || linkCode.expiresAt.getTime() < Date.now()) {
        return NextResponse.json({ error: 'invalid_or_expired' }, { status: 404 })
    }

    // Re-linking is intentional. Enforce 1:1 by dropping any prior link
    // owned by this Clerk user (their old Viber account) before upserting
    // the (possibly new) Viber identity.
    await prisma.viberUser.deleteMany({
        where: { clerkUserId: linkCode.clerkUserId, NOT: { viberUserId } },
    })

    await prisma.viberUser.upsert({
        where: { viberUserId },
        create: {
            viberUserId,
            clerkUserId: linkCode.clerkUserId,
            viberName: viberName ?? '',
        },
        update: {
            clerkUserId: linkCode.clerkUserId,
            viberName: viberName ?? '',
            linkedAt: new Date(),
        },
    })

    await prisma.viberLinkCode.update({
        where: { code },
        data: { consumedAt: new Date() },
    })

    let clerkName = ''
    try {
        const clerk = await clerkClient()
        const user = await clerk.users.getUser(linkCode.clerkUserId)
        clerkName = [user.firstName, user.lastName].filter(Boolean).join(' ') ||
            user.emailAddresses[0]?.emailAddress || ''
    } catch (err) {
        console.warn('[viber/link/redeem] Failed to fetch Clerk user name:', err)
    }

    return NextResponse.json({ clerkUserId: linkCode.clerkUserId, clerkName })
}
