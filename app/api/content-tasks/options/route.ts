import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
    const settings = await prisma.systemSettings.findFirst()
    const names = settings?.defaultContentTypes ?? []
    const colors = (settings?.contentTypeColors as Record<string, string> | null) ?? {}
    return NextResponse.json({
        contentTypes: names.map(name => ({ name, color: colors[name] ?? null })),
        tags: settings?.defaultTags ?? [],
    })
}) as any
