// app/api/intelligence/subscribe/events/[id]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

// DELETE — remove event selection
export const DELETE = withAuth(async (_req, { authCtx, params }) => {
  const { userId } = authCtx
  const { id: eventId } = await params

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ selected: false })
  }

  const existing = await prisma.intelligenceSubEvent.findUnique({
    where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.intelligenceSubEvent.delete({
        where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } },
      }),
      prisma.event.updateMany({
        where: { id: eventId, subscriptionCount: { gt: 0 } },
        data: { subscriptionCount: { decrement: 1 } },
      }),
    ])
  }

  return NextResponse.json({ selected: false, eventId })
})
