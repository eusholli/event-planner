// app/api/campaigns/[id]/approve/route.ts
// Approve a proposal (PENDING_REVIEW/REJECTED → APPROVED). Root/marketing only.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (_req, { params, authCtx }) => {
  const { id } = await params

  const existing = await prisma.campaignProposal.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'ACTIVATED') {
    return NextResponse.json({ error: 'Cannot approve an activated proposal' }, { status: 409 })
  }

  const user = await currentUser()
  const reviewedBy = user?.emailAddresses?.[0]?.emailAddress ?? authCtx.userId

  const updated = await prisma.campaignProposal.update({
    where: { id },
    data: { status: 'APPROVED', reviewedBy, reviewedAt: new Date(), rejectedReason: null },
    include: { event: { select: { id: true, name: true, slug: true } } },
  })
  return NextResponse.json(updated)
}, { requireRole: 'manageEvents' }) as never
