// app/api/marketing/generate-campaign/route.ts
// Enqueues an on-demand "Generate Campaign" run for ONE strategy theme. The browser
// (root/marketing) calls this; the sales-recon marketing-runner.py poller picks up the
// PENDING request and runs the agent. Debounced so a theme can't be double-queued.
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req, { authCtx }) => {
  let body: { theme?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const theme = typeof body.theme === 'string' ? body.theme.trim() : ''
  if (!theme) return NextResponse.json({ error: 'theme is required' }, { status: 400 })

  // Theme must exist in the current MarketingStrategy.
  const strategy = await prisma.marketingStrategy.findFirst({ orderBy: { createdAt: 'asc' }, select: { themes: true } })
  const themes = Array.isArray(strategy?.themes) ? (strategy.themes as Array<{ name?: unknown }>) : []
  const match = themes.find((t) => typeof t?.name === 'string' && t.name.trim().toLowerCase() === theme.toLowerCase())
  if (!match) {
    return NextResponse.json({ error: `Theme "${theme}" is not in the current marketing strategy` }, { status: 400 })
  }
  const canonicalTheme = String((match as { name: string }).name).trim()

  // Debounce: don't queue if one is already pending/running for this theme.
  const inFlight = await prisma.campaignRunRequest.findFirst({
    where: { theme: { equals: canonicalTheme, mode: 'insensitive' }, status: { in: ['PENDING', 'RUNNING'] } },
  })
  if (inFlight) {
    return NextResponse.json({ error: 'A campaign is already being generated for this theme', request: inFlight }, { status: 409 })
  }

  const user = await currentUser()
  const requestedBy = user?.emailAddresses?.[0]?.emailAddress ?? authCtx.userId

  const request = await prisma.campaignRunRequest.create({
    data: { theme: canonicalTheme, status: 'PENDING', requestedBy },
  })
  return NextResponse.json({ status: 'queued', request }, { status: 201 })
}, { requireRole: 'manageEvents' }) as never
