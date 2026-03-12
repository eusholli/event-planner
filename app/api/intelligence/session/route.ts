// app/api/intelligence/session/route.ts
import { NextResponse } from 'next/server'
import { createClerkClient, verifyToken } from '@clerk/backend'
import { signActionToken, ACTION_TOKEN_TTL_MS } from '@/lib/action-tokens'
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

  let body: { clerkToken?: string; eventId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clerkToken, eventId } = body
  if (!clerkToken) {
    return NextResponse.json({ error: 'clerkToken required' }, { status: 400 })
  }

  try {
    const payload = await verifyToken(clerkToken, { secretKey: process.env.CLERK_SECRET_KEY })
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    const user = await clerk.users.getUser(payload.sub)
    const role = (user.publicMetadata?.role as string) ?? 'user'
    const email = user.emailAddresses[0]?.emailAddress ?? ''
    const actionToken = signActionToken(payload.sub, role, email)

    // Optionally resolve event slug
    let eventSlug: string | null = null
    if (eventId) {
      const event = await prisma.event.findFirst({
        where: { OR: [{ id: eventId }, { slug: eventId }] },
        select: { slug: true }
      })
      eventSlug = event?.slug ?? null
    }

    return NextResponse.json({
      actionToken,
      userId: payload.sub,
      role,
      email,
      expiresAt: new Date(Date.now() + ACTION_TOKEN_TTL_MS).toISOString(),
      ...(eventSlug && { eventSlug })
    })
  } catch (err) {
    console.error('Session init error:', err)
    return NextResponse.json({ error: 'Invalid Clerk token' }, { status: 401 })
  }
}
