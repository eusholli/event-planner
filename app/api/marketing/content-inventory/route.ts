// app/api/marketing/content-inventory/route.ts
// Reuse-first inventory: the canonical source the marketing agent scans BEFORE
// generating anything new. Flattens existing content (ContentTask + attachments —
// stored as web URLs or R2 files), earlier LinkedIn campaigns (LinkedInDraft), and
// prior CampaignProposals into a single citable asset list. Machine-only (CRON secret).
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function validateSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET_KEY
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === secret && token.length > 0
}

export async function GET(req: Request) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const theme = new URL(req.url).searchParams.get('theme')?.toLowerCase().trim() || null

  try {
    const [tasks, drafts, proposals, settings, companies] = await Promise.all([
      prisma.contentTask.findMany({
        where: { status: { not: 'CANCELED' } },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: {
          id: true,
          title: true,
          description: true,
          contentType: true,
          tags: true,
          status: true,
          event: { select: { name: true } },
          attachments: { select: { fileUrl: true, originalName: true, title: true } },
        },
      }),
      prisma.linkedInDraft.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          title: true,
          content: true,
          angle: true,
          tone: true,
          articleType: true,
          status: true,
          ctaUrl: true,
          companyNames: true,
          eventId: true,
        },
      }),
      prisma.campaignProposal.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, theme: true, title: true, rationale: true, status: true, eventId: true },
      }),
      prisma.systemSettings.findFirst({ select: { defaultContentTypes: true, defaultTags: true } }),
      // Target companies already in our DB — the agent researches these (plus RS) and may add more.
      prisma.company.findMany({
        orderBy: { name: 'asc' },
        take: 300,
        select: { id: true, name: true, description: true, region: true },
      }),
    ])

    // Uniform asset shape so the agent can scan + cite by { kind, id } or by URL.
    let assets: Array<Record<string, unknown>> = [
      ...tasks.map((t) => ({
        kind: 'contentTask',
        id: t.id,
        title: t.title,
        summary: t.description ?? '',
        contentType: t.contentType,
        tags: t.tags,
        status: t.status,
        eventName: t.event?.name ?? null,
        // The actual reusable media lives on attachments (web URL or R2 file).
        attachments: t.attachments.map((a) => ({ url: a.fileUrl, name: a.originalName, title: a.title })),
      })),
      ...drafts.map((d) => ({
        kind: 'linkedInDraft',
        id: d.id,
        title: d.title ?? '(untitled draft)',
        summary: (d.content || '').slice(0, 300),
        angle: d.angle,
        tone: d.tone,
        articleType: d.articleType,
        status: d.status,
        ctaUrl: d.ctaUrl,
        companies: d.companyNames,
        eventId: d.eventId,
      })),
      ...proposals.map((p) => ({
        kind: 'campaignProposal',
        id: p.id,
        title: p.title,
        summary: p.rationale.slice(0, 300),
        theme: p.theme,
        status: p.status,
      })),
    ]

    if (theme) {
      assets = assets.filter((a) => {
        const tags = Array.isArray(a.tags) ? (a.tags as string[]) : []
        const hay = [a.title, a.summary, a.theme, a.contentType, ...tags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(theme)
      })
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      count: assets.length,
      assets,
      // Target companies already in our DB (research these + Rakuten Symphony).
      companies,
      // The system vocabulary the agent MUST constrain suggestedContentTasks to.
      allowedContentTypes: settings?.defaultContentTypes ?? [],
      allowedTags: settings?.defaultTags ?? [],
    })
  } catch (err) {
    console.error('[content-inventory] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
