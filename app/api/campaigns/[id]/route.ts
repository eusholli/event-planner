// app/api/campaigns/[id]/route.ts
// Get / edit a single campaign proposal. Root/marketing only.
// PUT edits only the human-editable fields (title, rationale, proposalContent) and
// is blocked once the proposal is ACTIVATED.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { getCampaignVocab, coerceSuggestedTasks } from '@/lib/campaign-vocab'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req, { params }) => {
  const { id } = await params
  const proposal = await prisma.campaignProposal.findUnique({
    where: { id },
    include: { event: { select: { id: true, name: true, slug: true } } },
  })
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(proposal)
}, { requireRole: 'manageEvents' }) as never

export const PUT = withAuth(async (req, { params }) => {
  const { id } = await params

  const existing = await prisma.campaignProposal.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'ACTIVATED') {
    return NextResponse.json({ error: 'Cannot edit an activated proposal' }, { status: 409 })
  }

  let body: { title?: unknown; rationale?: unknown; proposalContent?: unknown; suggestedContentTasks?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (typeof body.rationale === 'string') data.rationale = body.rationale
  if (typeof body.proposalContent === 'string') data.proposalContent = body.proposalContent
  // Human-edited content-item suggestions — coerce to the system vocabulary.
  if (Array.isArray(body.suggestedContentTasks)) {
    const { allowedContentTypes, allowedTags } = await getCampaignVocab()
    data.suggestedContentTasks = coerceSuggestedTasks(body.suggestedContentTasks, allowedContentTypes, allowedTags)
  }

  const updated = await prisma.campaignProposal.update({
    where: { id },
    data,
    include: { event: { select: { id: true, name: true, slug: true } } },
  })
  return NextResponse.json(updated)
}, { requireRole: 'manageEvents' }) as never

// Delete the proposal row only. Already-spawned ContentTasks / LinkedInDrafts are an
// independent execution layer and are intentionally left in place.
export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params
  try {
    await prisma.campaignProposal.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}, { requireRole: 'manageEvents' }) as never
