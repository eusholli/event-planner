// app/api/content-tasks/[id]/generate-draft/route.ts
// Drafts ONE content item in the Rakuten Symphony brand voice, grounded in current
// events via Gemini + Google Search, stores it as a Markdown file in R2, and attaches
// it to the ContentTask. Reuses the generateMarketingPlan pattern (direct Gemini, no
// li-agent / OpenClaw). Called per-item (parallel fan-out) on campaign Approve, or
// on-demand to (re-)draft a single task.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, isOwnerOrCanWrite } from '@/lib/with-auth'
import { generateContentWithLog } from '@/lib/gemini'
import { getBrandVoice } from '@/lib/brand-voice'
import { uploadNamedFileToR2 } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // Gemini with web search can be slow

// Map a content type to a li-agent-style article intent that steers structure/length.
function styleHintFor(contentType?: string | null): string {
  const key = (contentType ?? '').toLowerCase()
  if (key.includes('newsletter')) return 'awareness — educate and build recognition; jargon-free, shareable; ~400-700 words'
  if (key.includes('blog') || key.includes('article')) return 'thought leadership — first-principles analysis that challenges conventional wisdom; ~800-1400 words'
  if (key.includes('social')) return 'demand generation — punchy hook, one clear idea, a single CTA; ~120-280 words'
  if (key.includes('case')) return 'case study — relatable challenge, solution journey, specific result metrics, transferable lesson; ~700-1100 words'
  if (key.includes('podcast')) return 'podcast outline — segment-by-segment talking points and 5-7 interview questions'
  if (key.includes('recap') || key.includes('event')) return 'event recap — narrative summary, key moments, outcomes, and follow-up; ~500-900 words'
  if (key.includes('award')) return 'award/announcement — concise, credible, proof-backed; ~250-500 words'
  return 'professional B2B content; ~500-900 words'
}

function draftFilename(title: string): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  const base = (title || 'draft').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'draft'
  return `${base}-${date}-${time}.md`
}

export const POST = withAuth(async (req, { params, authCtx }) => {
  const { id } = await params

  const task = await prisma.contentTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Content task not found' }, { status: 404 })
  if (!(await isOwnerOrCanWrite(authCtx, task.createdBy))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { proposalId?: unknown } = {}
  try { body = await req.json() } catch { /* body optional */ }

  // Campaign context (proposalContent + target companies) when this task came from a proposal.
  let proposalContext = ''
  let targetCompanies = ''
  if (typeof body.proposalId === 'string' && body.proposalId) {
    const proposal = await prisma.campaignProposal.findUnique({
      where: { id: body.proposalId },
      select: { theme: true, title: true, rationale: true, proposalContent: true },
    })
    if (proposal) {
      proposalContext = `## Campaign theme\n${proposal.theme}\n\n## Campaign title\n${proposal.title}\n\n## Campaign brief\n${proposal.proposalContent || proposal.rationale}`
    }
  }

  // Target companies already in our DB (focus the content on these).
  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    take: 40,
    select: { name: true, description: true },
  })
  if (companies.length > 0) {
    targetCompanies = companies.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')
  }

  const brandVoice = await getBrandVoice()
  const today = new Date().toISOString().slice(0, 10)

  const prompt = `You are a senior content writer for Rakuten Symphony. Today is ${today}.
Write a complete, publish-ready draft for ONE content item, in the Rakuten Symphony brand voice.

# Brand voice (follow strictly)
${brandVoice}

# Content item to write
- Title: ${task.title}
- Type: ${task.contentType ?? 'Content'}
- Intent/structure: ${styleHintFor(task.contentType)}
${task.description ? `- Brief: ${task.description}` : ''}
${task.tags.length ? `- Tags/themes: ${task.tags.join(', ')}` : ''}

${proposalContext ? `# Campaign context\n${proposalContext}\n` : ''}
${targetCompanies ? `# Target companies in our database (make the content relevant to these where natural)\n${targetCompanies}\n` : ''}
# Requirements
- Use Google Search to ground the piece in CURRENT events. Reference concrete, recent
  (last 12 months) developments — name companies, products, dates, numbers. Discard anything
  older than 12 months; telecom facts go stale fast.
- Map the narrative to a specific Rakuten Symphony capability and the reader's pain point.
- Output ONLY the finished draft in clean Markdown (a title heading + body). No preamble,
  no "here is your draft", no notes about the process.`

  let draftText: string
  try {
    const result = await generateContentWithLog(
      'gemini-3-flash-preview',
      prompt,
      { functionName: 'CampaignDraft' },
      { tools: [{ googleSearch: {} }] },
    )
    draftText = result.response.text()?.trim() || ''
  } catch (err) {
    console.error('[generate-draft] Gemini error:', err)
    const msg = err instanceof Error ? err.message : 'Generation failed'
    const status = msg.includes('not configured') ? 400 : 502
    return NextResponse.json({ error: msg }, { status })
  }

  if (!draftText) {
    return NextResponse.json({ error: 'Empty draft returned' }, { status: 502 })
  }

  const filename = draftFilename(task.title)
  let fileUrl: string
  try {
    fileUrl = await uploadNamedFileToR2(Buffer.from(draftText, 'utf-8'), 'text/markdown', filename)
  } catch (err) {
    console.error('[generate-draft] R2 upload error:', err)
    return NextResponse.json({ error: 'Failed to store draft' }, { status: 500 })
  }

  const attachment = await prisma.contentTaskAttachment.create({
    data: { contentTaskId: id, title: `Draft — ${task.title}`, fileUrl, originalName: filename },
  })

  return NextResponse.json({ attachment, draft: draftText }, { status: 201 })
}) as never
