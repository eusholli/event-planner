import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canManageEvents } from '@/lib/roles'
import { deriveBriefingStatus } from '@/lib/pitch-status'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ pitchId: string }> }) {
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { pitchId } = await params

        const pitch = await prisma.pitch.findUnique({
            where: { id: pitchId },
            include: {
                event: { select: { id: true, name: true, slug: true, tags: true, meetingTypes: true, status: true } },
                sourcePitch: {
                    select: {
                        id: true,
                        title: true,
                        event: { select: { id: true, name: true, slug: true } },
                    },
                },
                targets: {
                    include: {
                        attendee: {
                            include: { company: { select: { id: true, name: true } } },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
                meetings: {
                    include: {
                        room: true,
                        attendees: { select: { id: true, name: true, email: true, isExternal: true, company: { select: { id: true, name: true } } } },
                    },
                    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
                },
            },
        })

        if (!pitch) {
            return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
        }

        const meetingsForStatus = pitch.meetings.map(m => ({
            id: m.id,
            status: m.status,
            date: m.date,
            startTime: m.startTime,
            attendees: m.attendees.map(a => ({ id: a.id })),
        }))

        const targets = pitch.targets.map(t => ({
            attendeeId: t.attendeeId,
            attendee: t.attendee,
            resultingUrls: t.resultingUrls,
            additionalNotes: t.additionalNotes,
            briefing: deriveBriefingStatus(t.attendeeId, meetingsForStatus),
        }))

        return NextResponse.json({
            id: pitch.id,
            title: pitch.title,
            pitchText: pitch.pitchText,
            tags: pitch.tags,
            createdAt: pitch.createdAt,
            modified: pitch.modified,
            event: pitch.event,
            sourcePitch: pitch.sourcePitch,
            targets,
            meetings: pitch.meetings,
        })
    } catch (error) {
        console.error('Error fetching pitch:', error)
        return NextResponse.json({ error: 'Failed to fetch pitch' }, { status: 500 })
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ pitchId: string }> }) {
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { pitchId } = await params
        const { title, pitchText, tags } = await request.json()

        const existing = await prisma.pitch.findUnique({ where: { id: pitchId }, select: { id: true } })
        if (!existing) {
            return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
        }

        const data: { title?: string; pitchText?: string; tags?: string[] } = {}
        if (title !== undefined) {
            if (!title.trim()) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
            data.title = title.trim()
        }
        if (pitchText !== undefined) data.pitchText = pitchText
        if (tags !== undefined && Array.isArray(tags)) data.tags = tags

        const updated = await prisma.pitch.update({ where: { id: pitchId }, data })
        return NextResponse.json(updated)
    } catch (error) {
        console.error('Error updating pitch:', error)
        return NextResponse.json({ error: 'Failed to update pitch' }, { status: 500 })
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ pitchId: string }> }) {
    try {
        if (!await canManageEvents()) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { pitchId } = await params
        await prisma.pitch.delete({ where: { id: pitchId } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting pitch:', error)
        return NextResponse.json({ error: 'Failed to delete pitch' }, { status: 500 })
    }
}
