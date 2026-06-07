// app/api/marketing/run-requests/[id]/route.ts
// GET: dual-auth (CRON or root/marketing) — the browser polls its request's status.
// PATCH: CRON-only — the marketing-runner.py claims/updates the request lifecycle.
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!validateSecret(req) && !(await canManageEvents())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const request = await prisma.campaignRunRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(request)
}

const VALID_STATUS = new Set(['PENDING', 'RUNNING', 'DONE', 'FAILED'])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  let body: { status?: unknown; runId?: unknown; proposalId?: unknown; error?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.status === 'string' && VALID_STATUS.has(body.status)) {
    data.status = body.status
    if (body.status === 'RUNNING') data.startedAt = new Date()
    if (body.status === 'DONE' || body.status === 'FAILED') data.finishedAt = new Date()
  }
  if (typeof body.runId === 'string') data.runId = body.runId
  if (typeof body.proposalId === 'string') data.proposalId = body.proposalId
  if (typeof body.error === 'string') data.error = body.error

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const updated = await prisma.campaignRunRequest.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
