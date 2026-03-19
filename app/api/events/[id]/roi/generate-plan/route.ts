import { NextResponse } from 'next/server'
import { resolveEventId } from '@/lib/events'
import { generateMarketingPlan } from '@/lib/actions/roi-generate'
import { withAuth } from '@/lib/with-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // Gemini with web search can be slow

const POSTHandler = withAuth(async (request, ctx) => {
    try {
        const rawId = (await ctx.params).id
        const id = await resolveEventId(rawId)
        if (!id) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        // Server-side idempotency guard — never overwrite an existing plan
        const existing = await prisma.eventROITargets.findUnique({
            where: { eventId: id },
            select: { marketingPlan: true },
        })

        if (existing?.marketingPlan) {
            return NextResponse.json({ marketingPlan: existing.marketingPlan, skipped: true })
        }

        const marketingPlan = await generateMarketingPlan(id)
        return NextResponse.json({ marketingPlan, skipped: false })

    } catch (error: unknown) {
        console.error('Error generating marketing plan:', error)
        const msg = error instanceof Error ? error.message : 'Failed to generate marketing plan'
        const status = msg.includes('not configured') ? 400 : 500
        return NextResponse.json({ error: msg }, { status })
    }
}, { requireRole: 'write', requireEventAccess: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = POSTHandler as any
