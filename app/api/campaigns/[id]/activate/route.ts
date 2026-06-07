// app/api/campaigns/[id]/activate/route.ts
// Activate an APPROVED proposal: materialize the execution layer (ContentTask rows,
// and LinkedInDraft rows when an event is set — its eventId FK is required), then
// mark the proposal ACTIVATED and record the generated ids. Root/marketing only.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

type TaskSuggestion = { title?: unknown; description?: unknown; contentType?: unknown; tags?: unknown }
type ArticleSuggestion = {
  title?: unknown
  content?: unknown
  angle?: unknown
  tone?: unknown
  articleType?: unknown
  companyNames?: unknown
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asStrings = (v: unknown): string[] => asArray(v).map((x) => String(x))

export const POST = withAuth(async (_req, { params, authCtx }) => {
  const { id } = await params

  const proposal = await prisma.campaignProposal.findUnique({ where: { id } })
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (proposal.status === 'ACTIVATED') {
    return NextResponse.json({ error: 'Proposal is already activated' }, { status: 409 })
  }
  if (proposal.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Proposal must be APPROVED before activation' }, { status: 409 })
  }

  const user = await currentUser()
  const createdBy = user?.emailAddresses?.[0]?.emailAddress ?? authCtx.userId

  const createdTaskIds: string[] = []
  const createdDraftIds: string[] = []

  // 1. ContentTasks from agent suggestions; fallback to a single task from the proposal
  //    so activation always yields at least one execution item.
  let taskSuggestions = asArray(proposal.suggestedContentTasks) as TaskSuggestion[]
  if (taskSuggestions.length === 0) {
    taskSuggestions = [{ title: proposal.title, description: proposal.rationale, contentType: 'Campaign' }]
  }
  for (const s of taskSuggestions) {
    if (!s?.title || typeof s.title !== 'string' || !s.title.trim()) continue
    const task = await prisma.contentTask.create({
      data: {
        title: s.title.trim(),
        description: typeof s.description === 'string' ? s.description : null,
        contentType: typeof s.contentType === 'string' ? s.contentType : 'Campaign',
        status: 'DRAFT', // agent-generated content starts as DRAFT until a leader promotes it to TODO

        tags: asStrings(s.tags),
        eventId: proposal.eventId ?? null,
        createdBy,
      },
    })
    createdTaskIds.push(task.id)
  }

  // 2. LinkedInDrafts — only when the proposal targets an event (FK is required).
  const articleSuggestions = asArray(proposal.suggestedLinkedInArticles) as ArticleSuggestion[]
  const skippedArticles: string[] = []
  for (const a of articleSuggestions) {
    if (!a?.content || typeof a.content !== 'string' || !a.content.trim()) continue
    if (!proposal.eventId) {
      skippedArticles.push(typeof a.title === 'string' ? a.title : '(untitled)')
      continue
    }
    const draft = await prisma.linkedInDraft.create({
      data: {
        eventId: proposal.eventId,
        companyIds: [],
        companyNames: asStrings(a.companyNames),
        title: typeof a.title === 'string' ? a.title : null,
        content: a.content,
        angle: typeof a.angle === 'string' ? a.angle : proposal.theme,
        tone: typeof a.tone === 'string' ? a.tone : 'professional',
        articleType: typeof a.articleType === 'string' ? a.articleType : null,
        status: 'DRAFT',
        createdBy,
      },
    })
    createdDraftIds.push(draft.id)
  }

  const updated = await prisma.campaignProposal.update({
    where: { id },
    data: {
      status: 'ACTIVATED',
      activatedBy: createdBy,
      activatedAt: new Date(),
      generatedContentTaskIds: createdTaskIds,
      generatedLinkedInDraftIds: createdDraftIds,
    },
    include: { event: { select: { id: true, name: true, slug: true } } },
  })

  return NextResponse.json({
    ...updated,
    createdTaskIds,
    createdDraftIds,
    skippedArticles, // articles that needed an event but the proposal was cross-event
  })
}, { requireRole: 'manageEvents' }) as never
