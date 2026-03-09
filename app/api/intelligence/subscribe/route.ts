// app/api/intelligence/subscribe/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

// POST — subscribe or reactivate
export const POST = withAuth(async (req, { authCtx }) => {
  const { userId } = authCtx

  const body = await req.json().catch(() => ({}))
  const email: string = body.email

  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const sub = await prisma.intelligenceSubscription.upsert({
    where: { userId },
    update: { active: true, email },
    create: { userId, email, active: true },
  })

  return NextResponse.json({ subscribed: true, email: sub.email })
})

// DELETE — deactivate
export const DELETE = withAuth(async (_req, { authCtx }) => {
  const { userId } = authCtx

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ subscribed: false })
  }

  await prisma.intelligenceSubscription.update({
    where: { userId },
    data: { active: false },
  })

  return NextResponse.json({ subscribed: false })
})

// GET — check subscription status + last email log
export const GET = withAuth(async (_req, { authCtx }) => {
  const { userId } = authCtx

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  const lastLog = sub
    ? await prisma.intelligenceEmailLog.findFirst({
        where: { userId, status: 'sent' },
        orderBy: { sentAt: 'desc' },
      })
    : null

  return NextResponse.json({
    subscribed: sub?.active ?? false,
    email: sub?.email ?? null,
    lastSentAt: lastLog?.sentAt ?? null,
    lastTargetCount: lastLog?.targetCount ?? null,
  })
})
