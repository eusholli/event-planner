// app/api/campaigns/[id]/regenerate-suggestions/route.ts
// Re-derives a proposal's suggestedContentTasks from its CURRENT (possibly edited)
// title/rationale/proposalContent via a fast direct Gemini call, constrained to the
// system content-type/tag vocabulary. Saves + returns the new suggestions.
// Root/marketing only.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { generateContentWithLog } from '@/lib/gemini'
import { getCampaignVocab, coerceSuggestedTasks } from '@/lib/campaign-vocab'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseJsonArray(text: string): unknown {
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const first = clean.indexOf('[')
  const last = clean.lastIndexOf(']')
  const json = first !== -1 && last !== -1 ? clean.slice(first, last + 1) : clean
  return JSON.parse(json)
}

export const POST = withAuth(async (_req, { params }) => {
  const { id } = await params

  const proposal = await prisma.campaignProposal.findUnique({
    where: { id },
    select: { status: true, theme: true, title: true, rationale: true, proposalContent: true },
  })
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (proposal.status === 'ACTIVATED') {
    return NextResponse.json({ error: 'Cannot regenerate suggestions for an activated proposal' }, { status: 409 })
  }

  const { allowedContentTypes, allowedTags } = await getCampaignVocab()

  const prompt = `You are a B2B content strategist for Rakuten Symphony. From the campaign brief
below, propose 3-5 concrete content items to produce.

# Campaign
Theme: ${proposal.theme}
Title: ${proposal.title}
Brief:
${proposal.proposalContent || proposal.rationale}

# Rules
- "contentType" MUST be exactly one of: ${allowedContentTypes.length ? allowedContentTypes.join(', ') : '(none configured)'}.
- "tags" MUST be a (possibly empty) subset of: ${allowedTags.length ? allowedTags.join(', ') : '(none configured)'}.
- Each item needs a specific, publish-worthy "title" and a one-sentence "description".

Return ONLY a JSON array, no markdown/backticks/explanation:
[ { "title": "...", "description": "...", "contentType": "...", "tags": ["..."] } ]`

  let suggestions
  try {
    const result = await generateContentWithLog('gemini-3-flash-preview', prompt, { functionName: 'CampaignRegenerateSuggestions' })
    suggestions = coerceSuggestedTasks(parseJsonArray(result.response.text()), allowedContentTypes, allowedTags)
  } catch (err) {
    console.error('[regenerate-suggestions] error:', err)
    const msg = err instanceof Error ? err.message : 'Generation failed'
    const status = msg.includes('not configured') ? 400 : 502
    return NextResponse.json({ error: msg }, { status })
  }

  const updated = await prisma.campaignProposal.update({
    where: { id },
    data: { suggestedContentTasks: suggestions as never },
    include: { event: { select: { id: true, name: true, slug: true } } },
  })
  return NextResponse.json(updated)
}, { requireRole: 'manageEvents' }) as never
