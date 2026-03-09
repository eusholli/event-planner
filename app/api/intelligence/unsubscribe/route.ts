// app/api/intelligence/unsubscribe/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') // token = userId (Clerk ID) or email

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // Accept userId or email — idempotent regardless
  const sub = await prisma.intelligenceSubscription.findFirst({
    where: { OR: [{ userId: token }, { email: token }] },
  })

  if (sub) {
    await prisma.intelligenceSubscription.update({
      where: { id: sub.id },
      data: { active: false },
    })
  }

  return NextResponse.redirect(
    new URL('/intelligence/subscribe?unsubscribed=true', req.url)
  )
}
