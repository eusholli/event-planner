// app/api/campaigns/[id]/reject/route.ts
// Reject a proposal (→ REJECTED) with an optional reason. Root/marketing only.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req, { params, authCtx }) => {
  const { id } = await params

  const existing = await prisma.campaignProposal.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'ACTIVATED') {
    return NextResponse.json({ error: 'Cannot reject an activated proposal' }, { status: 409 })
  }

  let reason: string | null = null
  try {
    const body = await req.json()
    if (typeof body?.reason === 'string' && body.reason.trim()) reason = body.reason.trim()
  } catch {
    // reason is optional; ignore body parse errors
  }

  const user = await currentUser()
  const reviewedBy = user?.emailAddresses?.[0]?.emailAddress ?? authCtx.userId

  const updated = await prisma.campaignProposal.update({
    where: { id },
    data: { status: 'REJECTED', reviewedBy, reviewedAt: new Date(), rejectedReason: reason },
    include: { event: { select: { id: true, name: true, slug: true } } },
  })
  return NextResponse.json(updated)
}, { requireRole: 'manageEvents' }) as never
