// app/api/intelligence/subscribe/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

// GET — check subscription status + selections + last email log
export const GET = withAuth(async (_req, { authCtx }) => {
  const { userId } = authCtx

  const sub = await prisma.intelligenceSubscription.findUnique({
    where: { userId },
    include: {
      selectedAttendees: { select: { attendeeId: true } },
      selectedCompanies: { select: { companyId: true } },
      selectedEvents:    { select: { eventId: true } },
    },
  })

  const lastLog = sub
    ? await prisma.intelligenceEmailLog.findFirst({
        where: { userId, status: 'sent' },
        orderBy: { sentAt: 'desc' },
      })
    : null

  return NextResponse.json({
    subscribed: sub?.active ?? false,
    email: sub?.email ?? null,
    selectedAttendeeIds: sub?.selectedAttendees.map(r => r.attendeeId) ?? [],
    selectedCompanyIds:  sub?.selectedCompanies.map(r => r.companyId)  ?? [],
    selectedEventIds:    sub?.selectedEvents.map(r => r.eventId)       ?? [],
    lastSentAt:          lastLog?.sentAt ?? null,
    lastTargetCount:     lastLog?.targetCount ?? null,
  })
})

// POST — subscribe or reactivate
export const POST = withAuth(async (_req, { authCtx }) => {
  const { userId } = authCtx

  // Get email from Clerk
  let email: string | null = null
  if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
    const user = await currentUser()
    email = user?.primaryEmailAddress?.emailAddress ?? null
  } else {
    email = 'mock@example.com'
  }

  if (!email) {
    return NextResponse.json({ error: 'No email address on account' }, { status: 400 })
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
