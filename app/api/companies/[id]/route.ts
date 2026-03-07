import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { canWrite } = await import('@/lib/roles')
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { id } = await params

        const company = await prisma.company.findUnique({
            where: { id },
            include: {
                _count: { select: { attendees: true } }
            }
        })

        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 })
        }

        return NextResponse.json(company)
    } catch (error) {
        console.error('Error fetching company:', error)
        return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 })
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { canWrite } = await import('@/lib/roles')
        if (!await canWrite()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { id } = await params
        const json = await request.json()
        const { name, description, pipelineValue } = json

        const updateData: any = {}
        if (name !== undefined) updateData.name = name.trim()
        if (description !== undefined) updateData.description = description || null
        if (pipelineValue !== undefined) updateData.pipelineValue = pipelineValue !== null && pipelineValue !== '' ? parseFloat(pipelineValue) : null

        // Check for name uniqueness if name is being updated
        if (name) {
            const existing = await prisma.company.findFirst({
                where: {
                    name: {
                        equals: name.trim(),
                        mode: 'insensitive'
                    },
                    NOT: { id }
                }
            })
            if (existing) {
                return NextResponse.json({ error: 'A company with this name already exists' }, { status: 409 })
            }
        }

        const company = await prisma.company.update({
            where: { id },
            data: updateData,
            include: {
                _count: { select: { attendees: true } }
            }
        })

        return NextResponse.json(company)
    } catch (error) {
        console.error('Error updating company:', error)
        return NextResponse.json({ error: 'Failed to update company' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { canManageEvents } = await import('@/lib/roles')
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { id } = await params

        // Check if company has attendees
        const company = await prisma.company.findUnique({
            where: { id },
            include: { _count: { select: { attendees: true } } }
        })

        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 })
        }

        if (company._count.attendees > 0) {
            return NextResponse.json({
                error: `Cannot delete company "${company.name}" because it has ${company._count.attendees} attendee(s) linked to it. Reassign or remove them first.`
            }, { status: 409 })
        }

        await prisma.company.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting company:', error)
        return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 })
    }
}
