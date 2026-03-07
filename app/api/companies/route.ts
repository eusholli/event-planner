import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { canWrite } = await import('@/lib/roles')
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const query = searchParams.get('query')

        const where = query
            ? { name: { contains: query, mode: 'insensitive' as const } }
            : {}

        const companies = await prisma.company.findMany({
            where,
            orderBy: { name: 'asc' },
            include: {
                _count: { select: { attendees: true } }
            }
        })

        return NextResponse.json(companies)
    } catch (error) {
        console.error('Error fetching companies:', error)
        return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { canWrite } = await import('@/lib/roles')
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const json = await request.json()
        const { name, description, pipelineValue } = json

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
        }

        // Check for existing company with same name (case-insensitive)
        const existing = await prisma.company.findFirst({
            where: {
                name: {
                    equals: name.trim(),
                    mode: 'insensitive'
                }
            }
        })

        if (existing) {
            return NextResponse.json({ error: 'A company with this name already exists' }, { status: 409 })
        }

        const company = await prisma.company.create({
            data: {
                name: name.trim(),
                description: description || null,
                pipelineValue: pipelineValue ? parseFloat(pipelineValue) : null,
            },
            include: {
                _count: { select: { attendees: true } }
            }
        })

        return NextResponse.json(company)
    } catch (error) {
        console.error('Error creating company:', error)
        return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
    }
}
