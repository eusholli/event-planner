// app/api/intelligence/subscribe/attendees/[id]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

// DELETE — remove attendee selection
export const DELETE = withAuth(async (_req, { authCtx, params }) => {
  const { userId } = authCtx
  const { id: attendeeId } = await params

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ selected: false })
  }

  const existing = await prisma.intelligenceSubAttendee.findUnique({
    where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.intelligenceSubAttendee.delete({
        where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId } },
      }),
      prisma.attendee.updateMany({
        where: { id: attendeeId, subscriptionCount: { gt: 0 } },
        data: { subscriptionCount: { decrement: 1 } },
      }),
    ])
  }

  return NextResponse.json({ selected: false, attendeeId })
}) as any
