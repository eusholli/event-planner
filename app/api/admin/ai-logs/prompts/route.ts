import { NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/with-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const { searchParams } = new URL(req.url)
        const userEmail = searchParams.get('userEmail') // optional
        const functionNameParam = searchParams.get('functionName') // optional, comma-separated
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

        if (!userEmail && !functionNameParam) {
            return NextResponse.json({ error: 'At least one of userEmail or functionName is required' }, { status: 400 })
        }

        // Build where clause
        const where: any = {}
        if (userEmail) {
            where.userEmail = userEmail
        }
        if (functionNameParam) {
            const names = functionNameParam.split(',').filter(Boolean)
            if (names.length > 0) {
                where.functionName = { in: names }
            }
        }

        // Fetch ONLY 10 rows for this page — no bulk reads. Always newest first.
        const [prompts, totalCount] = await Promise.all([
            prisma.aILog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                select: {
                    id: true,
                    userEmail: true,
                    prompt: true,
                    functionName: true,
                    createdAt: true,
                }
            }),
            prisma.aILog.count({ where })
        ])

        return NextResponse.json({
            prompts,
            totalCount,
            page,
            totalPages: Math.ceil(totalCount / PAGE_SIZE),
        })
    } catch (error) {
        console.error('Error fetching AI log prompts:', error)
        return NextResponse.json({ error: 'Failed to fetch prompts' }, { status: 500 })
    }
}

export const GET = withAuth(handleGET, { requireRole: 'root' }) as any
