// app/api/intelligence/subscribe/events/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

// Ensure a subscription record exists for this user (creates inactive one if needed)
async function ensureSubscription(userId: string): Promise<string> {
  let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    let email = 'unknown@example.com'
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
      const user = await currentUser()
      email = user?.primaryEmailAddress?.emailAddress ?? email
    }
    try {
      sub = await prisma.intelligenceSubscription.create({
        data: { userId, email, active: false },
      })
    } catch {
      // Race condition: another request created it first
      sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
      if (!sub) throw new Error('Failed to create or find subscription')
    }
  }
  return sub.id
}

// POST — add event selection
export const POST = withAuth(async (req, { authCtx }) => {
  const { userId } = authCtx
  const body = await req.json().catch(() => ({}))
  const { eventId } = body

  if (!eventId || typeof eventId !== 'string') {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  const subscriptionId = await ensureSubscription(userId)

  // Check event exists
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Idempotent: attempt create + increment atomically, ignore duplicate
  try {
    await prisma.$transaction([
      prisma.intelligenceSubEvent.create({ data: { subscriptionId, eventId } }),
      prisma.event.update({ where: { id: eventId }, data: { subscriptionCount: { increment: 1 } } }),
    ])
  } catch (err: any) {
    // P2002 = unique constraint violation = already selected, treat as no-op
    if (err?.code !== 'P2002') throw err
  }

  return NextResponse.json({ selected: true, eventId })
}) as any
