// app/api/intelligence/report-exists/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const names: string[] = Array.isArray(body.names) ? body.names : []
  if (!names.length) return NextResponse.json({ existingNames: [] })

  const reports = await prisma.intelligenceReport.findMany({
    where: { targetName: { in: names } },
    distinct: ['targetName'],
    select: { targetName: true },
  })

  return NextResponse.json({ existingNames: reports.map(r => r.targetName) })
}
