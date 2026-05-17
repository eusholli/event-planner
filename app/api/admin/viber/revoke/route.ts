import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/with-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function handleDELETE(req: Request, _ctx: any) {
    const { clerkUserId } = await req.json()

    if (!clerkUserId) {
        return NextResponse.json({ error: 'Missing clerkUserId' }, { status: 400 })
    }

    await prisma.viberUser.deleteMany({ where: { clerkUserId } })
    return NextResponse.json({ ok: true })
}

export const DELETE = withAuth(handleDELETE, { requireRole: 'manageEvents' }) as any
