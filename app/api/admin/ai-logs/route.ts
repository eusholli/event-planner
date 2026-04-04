import { NextResponse } from 'next/server'
import { Roles } from '@/lib/constants'
import { withAuth, type AuthContext } from '@/lib/with-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const { searchParams } = new URL(req.url)
        const functionName = searchParams.get('functionName')
        const modelUsed = searchParams.get('modelUsed')

        const where: any = {}
        if (functionName) {
            where.functionName = { in: functionName.split(',') }
        }
        if (modelUsed) {
            where.modelUsed = { in: modelUsed.split(',') }
        }

        const logs = await prisma.aILog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 1000 // Just to prevent blowing up response size if too many
        })

        // Also fetch unique models and functions for the filter sidebar
        const uniqueTasksResult = await prisma.aILog.groupBy({
            by: ['functionName']
        })
        const uniqueModelsResult = await prisma.aILog.groupBy({
            by: ['modelUsed']
        })

        return NextResponse.json({
            logs,
            filters: {
                functionNames: uniqueTasksResult.map((u: any) => u.functionName).filter(Boolean),
                models: uniqueModelsResult.map((u: any) => u.modelUsed).filter(Boolean)
            }
        })
    } catch (error) {
        console.error('Error fetching AI logs:', error)
        return NextResponse.json({ error: 'Failed to fetch AI logs' }, { status: 500 })
    }
}

export const GET = withAuth(handleGET, { requireRole: 'root' }) as any
