// app/api/intelligence/unsubscribe/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') // token = userId (Clerk ID) or email

  if (!token) {
    // No token — redirect to success page anyway (idempotent)
    return NextResponse.redirect(
      new URL('/intelligence/subscribe?unsubscribed=true', req.url)
    )
  }

  // Lookup by opaque unsubscribeToken only — idempotent regardless
  const sub = await prisma.intelligenceSubscription.findUnique({
    where: { unsubscribeToken: token },
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
