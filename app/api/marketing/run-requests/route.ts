// app/api/marketing/run-requests/route.ts
// Dual-auth GET: sales-recon marketing-runner.py polls this (CRON bearer) for PENDING
// requests; the /campaigns page polls it (root/marketing session) with ?active=1 for the
// "generating…" banner.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'

export const dynamic = 'force-dynamic'

function validateSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET_KEY
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === secret && token.length > 0
}

export async function GET(req: Request) {
  if (!validateSecret(req) && !(await canManageEvents())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = new URL(req.url).searchParams
  // ?active=1 → in-flight (PENDING + RUNNING); otherwise filter by ?status= (default PENDING).
  const where = params.get('active') === '1'
    ? { status: { in: ['PENDING', 'RUNNING'] } }
    : { status: params.get('status') ?? 'PENDING' }
  const requests = await prisma.campaignRunRequest.findMany({
    where,
    orderBy: { requestedAt: 'asc' },
    take: 50,
  })
  return NextResponse.json({ requests })
}
