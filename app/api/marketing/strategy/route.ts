// app/api/marketing/strategy/route.ts
// The single living "themes Rakuten Symphony wants to own" document.
// GET: dual-auth — machine (CRON secret, used by the marketing agent) or browser
//      (root/marketing). PUT: root/marketing only (the editor).
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'
import { currentUser } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

function validateSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET_KEY
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === secret && token.length > 0
}

// Single living doc: read the first (and only) row.
async function getStrategyRow() {
  return prisma.marketingStrategy.findFirst({ orderBy: { createdAt: 'asc' } })
}

type Theme = { name: string; description: string; priority: string | number | null }

function cleanThemes(input: unknown): Theme[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .filter((t) => typeof t.name === 'string' && (t.name as string).trim().length > 0)
    .map((t) => ({
      name: String(t.name).trim(),
      description: typeof t.description === 'string' ? t.description : '',
      priority:
        typeof t.priority === 'number' || typeof t.priority === 'string' ? (t.priority as string | number) : null,
    }))
}

export async function GET(req: Request) {
  if (!validateSecret(req) && !(await canManageEvents())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const strategy = await getStrategyRow()
  return NextResponse.json({
    id: strategy?.id ?? null,
    themes: Array.isArray(strategy?.themes) ? strategy.themes : [],
    updatedAt: strategy?.updatedAt ?? null,
    updatedBy: strategy?.updatedBy ?? null,
  })
}

export async function PUT(req: Request) {
  if (!(await canManageEvents())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const themes = cleanThemes((body as { themes?: unknown })?.themes)

  const user = await currentUser()
  const updatedBy = user?.emailAddresses?.[0]?.emailAddress ?? null

  const existing = await getStrategyRow()
  const saved = existing
    ? await prisma.marketingStrategy.update({ where: { id: existing.id }, data: { themes, updatedBy } })
    : await prisma.marketingStrategy.create({ data: { themes, updatedBy } })

  return NextResponse.json({
    id: saved.id,
    themes: saved.themes,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
  })
}
