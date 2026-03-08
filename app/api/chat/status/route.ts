import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth, type AuthContext } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const settings = await prisma.systemSettings.findFirst();
        return NextResponse.json({
            ready: !!settings?.geminiApiKey
        });
    } catch (error) {
        console.error('Failed to check chat status:', error);
        return NextResponse.json({ ready: false }, { status: 500 });
    }
}

export const GET = withAuth(handleGET, { requireAuth: true }) as any;
