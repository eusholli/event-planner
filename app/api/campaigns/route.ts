// app/api/campaigns/route.ts
// List campaign proposals. Root/marketing only (capability invisible to admin/user).
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const statuses = searchParams.get('status')?.split(',').filter(Boolean)
    const search = searchParams.get('search')?.toLowerCase()

    const where: Record<string, unknown> = {}
    if (statuses && statuses.length > 0) where.status = { in: statuses }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { theme: { contains: search, mode: 'insensitive' } },
        { rationale: { contains: search, mode: 'insensitive' } },
      ]
    }

    const proposals = await prisma.campaignProposal.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: { event: { select: { id: true, name: true, slug: true } } },
    })
    return NextResponse.json(proposals)
  } catch (error) {
    console.error('Failed to fetch campaign proposals:', error)
    return NextResponse.json({ error: 'Failed to fetch campaign proposals' }, { status: 500 })
  }
}, { requireRole: 'manageEvents' }) as never
