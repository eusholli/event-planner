// app/api/intelligence/subscribe/companies/[id]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

// DELETE — remove company selection
export const DELETE = withAuth(async (_req, { authCtx, params }) => {
  const { userId } = authCtx
  const { id: companyId } = await params

  const sub = await prisma.intelligenceSubscription.findUnique({ where: { userId } })
  if (!sub) {
    return NextResponse.json({ selected: false })
  }

  const existing = await prisma.intelligenceSubCompany.findUnique({
    where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.intelligenceSubCompany.delete({
        where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId } },
      }),
      prisma.company.updateMany({
        where: { id: companyId, subscriptionCount: { gt: 0 } },
        data: { subscriptionCount: { decrement: 1 } },
      }),
    ])
  }

  return NextResponse.json({ selected: false, companyId })
}) as any
