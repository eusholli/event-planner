import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { withAuth } from '@/lib/with-auth'
import { resolveEventId } from '@/lib/events'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const POSTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const eventId = await resolveEventId(rawId)
        if (!eventId) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const { companyNames } = await request.json() as { companyNames: string[] }
        if (!Array.isArray(companyNames) || companyNames.length === 0) {
            return NextResponse.json({ error: 'companyNames is required' }, { status: 400 })
        }
        if (companyNames.length > 20 || !companyNames.every((n: unknown) => typeof n === 'string')) {
            return NextResponse.json({ error: 'companyNames must be an array of up to 20 strings' }, { status: 400 })
        }
        const sanitizedNames = companyNames.map((n: string) => n.slice(0, 200))

        const [event, roiRecord, settings] = await Promise.all([
            prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }),
            prisma.eventROITargets.findUnique({ where: { eventId }, select: { marketingPlan: true } }),
            prisma.systemSettings.findFirst(),
        ])

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const apiKey = settings?.geminiApiKey
        if (!apiKey) {
            return NextResponse.json({ error: 'Gemini API key not configured in System Settings' }, { status: 400 })
        }

        const marketingPlan = roiRecord?.marketingPlan ?? null
        const hadMarketingPlan = !!marketingPlan
        const companyList = sanitizedNames.join(', ')

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: 'gemini-3-flash-preview',
            // @ts-expect-error — googleSearch tool typing not yet in SDK types
            tools: [{ googleSearch: {} }],
        })

        const contextSection = hadMarketingPlan
            ? `Event Marketing Plan (excerpt):\n${marketingPlan!.slice(0, 1500)}`
            : `Event name: "${event.name}"\nTarget companies: ${companyList}`

        const prompt = `You are a marketing strategist for Rakuten Symphony.

Use Google Search to find:
1. The latest news (2025–2026) about each of these companies: ${companyList}
2. The latest news (2025–2026) about Rakuten Symphony

${contextSection}

Based on this research, write a compelling 200–300 word article brief that:
- Identifies a powerful and timely insight connecting Rakuten Symphony's capabilities to these companies' current challenges or strategic priorities
- Proposes a unique angle for a LinkedIn thought-leadership article authored by Rakuten Symphony leadership
- Focuses on CTOs and VP Operations at tier-1 and tier-2 telcos as the target audience
- Reflects quiet boldness and first-principles thinking — avoid buzzwords like "leverage", "unlock", "game-changer"
- Is written as a ready-to-use brief for a professional article writer (not the article itself)

Return only the brief text. No preamble, no section labels, no explanation.`

        const result = await model.generateContent(prompt)
        const brief = result.response.text()

        return NextResponse.json({ brief, hadMarketingPlan })
    } catch (error: unknown) {
        console.error('Error generating LinkedIn article brief:', error)
        const msg = error instanceof Error ? error.message : 'Failed to generate brief'
        const status = msg.includes('not configured') ? 400 : 500
        return NextResponse.json({ error: msg }, { status })
    }
}, { requireRole: 'manageEvents', requireEventAccess: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = POSTHandler as any
