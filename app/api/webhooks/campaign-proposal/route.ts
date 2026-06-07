// app/api/webhooks/campaign-proposal/route.ts
// Inbound campaign proposals from the marketing agent. Mirrors intel-report:
// CRON-secret auth + idempotent upsert on (runId, theme). Accepts either a single
// proposal object or { runId, proposals: [...] }. Status is never reset on re-POST.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { coerceSuggestedTasks } from '@/lib/campaign-vocab'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function validateSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET_KEY
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === secret && token.length > 0
}

type IncomingProposal = {
  theme?: string
  title?: string
  rationale?: string
  proposalContent?: string
  eventId?: string | null
  reusedAssets?: unknown
  suggestedContentTasks?: unknown
  suggestedLinkedInArticles?: unknown
}

export async function POST(req: Request) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: {
    runId?: string
    proposals?: IncomingProposal[]
    discoveredCompanies?: Array<{ name?: string; description?: string; region?: string }>
  } & IncomingProposal
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const runId = typeof payload?.runId === 'string' ? payload.runId : null
  const proposals: IncomingProposal[] = Array.isArray(payload?.proposals)
    ? payload.proposals
    : payload?.theme
      ? [payload]
      : []

  if (!runId || proposals.length === 0) {
    return NextResponse.json({ error: 'runId and at least one proposal required' }, { status: 400 })
  }

  console.log(`[campaign-proposal] incoming runId=${runId} proposals=${proposals.length}`)

  // Phase 1 entity enrichment: resolve-or-create discovered companies (case-insensitive),
  // System vocab to constrain content-task suggestions.
  const settings = await prisma.systemSettings.findFirst({ select: { defaultContentTypes: true, defaultTags: true } })
  const allowedTypes = settings?.defaultContentTypes ?? []
  const allowedTags = settings?.defaultTags ?? []

  // mirroring lib/tools/ops.ts addAttendeeOp. The full action-token attendee flow is Phase 3.
  let enrichedCompanies = 0
  for (const c of Array.isArray(payload.discoveredCompanies) ? payload.discoveredCompanies : []) {
    const name = typeof c?.name === 'string' ? c.name.trim() : ''
    if (!name) continue
    try {
      const existing = await prisma.company.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
      if (existing) {
        // Only fill a missing description; never overwrite curated data.
        if (!existing.description && typeof c.description === 'string' && c.description.trim()) {
          await prisma.company.update({ where: { id: existing.id }, data: { description: c.description.trim() } })
        }
      } else {
        await prisma.company.create({
          data: {
            name,
            description: typeof c.description === 'string' ? c.description.trim() || null : null,
            region: typeof c.region === 'string' ? c.region.trim() || null : null,
          },
        })
        enrichedCompanies++
      }
    } catch (err) {
      console.error(`[campaign-proposal] company enrichment failed for "${name}":`, err)
    }
  }

  const results: Array<{ theme: string; id: string; status: string }> = []
  try {
    for (const p of proposals) {
      if (!p?.theme || !p?.title) continue

      // Resolve eventId (UUID or slug) when provided; proposals may be cross-event (null).
      let eventId: string | null = null
      if (p.eventId) {
        const ev = await prisma.event.findFirst({
          where: { OR: [{ id: p.eventId }, { slug: p.eventId }] },
          select: { id: true },
        })
        eventId = ev?.id ?? null
      }

      const common = {
        title: p.title,
        rationale: p.rationale ?? '',
        proposalContent: p.proposalContent ?? '',
        eventId,
        reusedAssets: (p.reusedAssets ?? undefined) as never,
        suggestedContentTasks: (p.suggestedContentTasks == null
          ? undefined
          : coerceSuggestedTasks(p.suggestedContentTasks, allowedTypes, allowedTags)) as never,
        suggestedLinkedInArticles: (p.suggestedLinkedInArticles ?? undefined) as never,
      }

      const saved = await prisma.campaignProposal.upsert({
        where: { runId_theme: { runId, theme: p.theme } },
        // Note: status intentionally NOT updated — re-POST must not un-approve/re-open.
        update: common,
        create: {
          runId,
          theme: p.theme,
          status: 'PENDING_REVIEW',
          createdBy: 'marketing-agent',
          ...common,
        },
      })
      results.push({ theme: saved.theme, id: saved.id, status: saved.status })
    }
  } catch (err) {
    console.error('[campaign-proposal] upsert failed:', err)
    return NextResponse.json({ error: 'Failed to store proposals' }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', runId, upserted: results.length, enrichedCompanies, proposals: results })
}
