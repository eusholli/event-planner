// app/api/intelligence/report/[targetName]/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { verifyReportToken } from '@/lib/action-tokens'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ targetName: string }> }
) {
  const { targetName } = await params
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (token) {
    const payload = verifyReportToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }
  } else {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const decodedName = decodeURIComponent(targetName)

  const report = await prisma.intelligenceReport.findFirst({
    where: { targetName: decodedName },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      targetType: true,
      targetName: true,
      summary: true,
      salesAngle: true,
      recommendedAction: true,
      fullReport: true,
      createdAt: true,
    },
  })

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  return NextResponse.json(report)
}
