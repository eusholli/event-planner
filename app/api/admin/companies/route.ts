import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

async function getHandler(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '25')))
        const search = searchParams.get('search') || ''
        const region = searchParams.get('region') || ''
        const skip = (page - 1) * limit

        const where: any = {}
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ]
        }
        if (region) {
            where.region = region
        }

        const [data, totalCount] = await Promise.all([
            prisma.company.findMany({
                where,
                include: { _count: { select: { attendees: true } } },
                orderBy: { name: 'asc' },
                skip,
                take: limit
            }),
            prisma.company.count({ where })
        ])

        return NextResponse.json({ data, totalCount })
    } catch (error) {
        console.error('Error fetching companies:', error)
        return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 })
    }
}

export const GET = withAuth(getHandler, { requireAuth: true }) as any
