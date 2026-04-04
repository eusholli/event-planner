import { NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/with-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const { searchParams } = new URL(req.url)
        const functionName = searchParams.get('functionName')

        const where: any = {}
        if (functionName) {
            where.functionName = { in: functionName.split(',') }
        }

        // Return aggregated usage counts grouped by user and function
        const grouped = await prisma.aILog.groupBy({
            by: ['userEmail', 'functionName'],
            where,
            _count: { _all: true },
            orderBy: [{ userEmail: 'asc' }, { functionName: 'asc' }]
        })

        // Fetch unique function names for the filter sidebar (always unfiltered)
        const uniqueFunctionsResult = await prisma.aILog.groupBy({
            by: ['functionName']
        })

        const usageRows = grouped.map((row: any) => ({
            userEmail: row.userEmail,
            functionName: row.functionName,
            uses: row._count._all,
        }))

        return NextResponse.json({
            usage: usageRows,
            filters: {
                functionNames: uniqueFunctionsResult.map((u: any) => u.functionName).filter(Boolean),
            }
        })
    } catch (error) {
        console.error('Error fetching AI logs:', error)
        return NextResponse.json({ error: 'Failed to fetch AI logs' }, { status: 500 })
    }
}

export const GET = withAuth(handleGET, { requireRole: 'root' }) as any
