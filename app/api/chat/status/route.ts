
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
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
