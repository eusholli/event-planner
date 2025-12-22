import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    try {
        // Validate URL - basic check to prevent open proxy abuse
        // We can tighten this to only allow our R2 domain if needed, e.g.
        // if (!url.startsWith(process.env.R2_PUBLIC_URL)) ...
        // For now, we allow http/https to support external images if needed, 
        // but ideally we should restrict.
        const targetUrl = new URL(url);
        if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
            return new NextResponse('Invalid protocol', { status: 400 });
        }

        const response = await fetch(url);

        if (!response.ok) {
            return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
        }

        const contentType = response.headers.get('content-type');
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType || 'application/octet-stream',
                'Cache-Control': 'public, max-age=3600',
                // Important: This allows the browser to access it comfortably
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Image proxy error:', error);
        return new NextResponse('Failed to fetch image', { status: 500 });
    }
}
