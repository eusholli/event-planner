// app/api/intelligence/subscribe/companies/route.ts
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

// POST — add company selection
export const POST = withAuth(async (req, { authCtx }) => {
  const { userId } = authCtx
  const body = await req.json().catch(() => ({}))
  const { companyId } = body

  if (!companyId || typeof companyId !== 'string') {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const subscriptionId = await ensureSubscription(userId)

  // Check company exists
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Idempotent: attempt create + increment atomically, ignore duplicate
  try {
    await prisma.$transaction([
      prisma.intelligenceSubCompany.create({ data: { subscriptionId, companyId } }),
      prisma.company.update({ where: { id: companyId }, data: { subscriptionCount: { increment: 1 } } }),
    ])
  } catch (err: any) {
    // P2002 = unique constraint violation = already selected, treat as no-op
    if (err?.code !== 'P2002') throw err
  }

  return NextResponse.json({ selected: true, companyId })
}) as any
