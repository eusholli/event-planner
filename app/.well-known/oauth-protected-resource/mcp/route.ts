import { protectedResourceHandlerClerk, metadataCorsOptionsRequestHandler } from '@clerk/mcp-tools/next'

// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// MCP clients fetch this to discover Clerk as the authorization server.
// This endpoint must remain public (no auth wrapper).

const _clerk = protectedResourceHandlerClerk()

// protectedResourceHandlerClerk derives the resource URL from new URL(request.url).origin.
// Behind Traefik the Next.js server sees the internal bind address (0.0.0.0:3000) instead
// of the public hostname, so we rewrite the origin to NEXT_PUBLIC_APP_URL before delegating.
export function GET(request: Request) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) return _clerk(request)
    const publicOrigin = new URL(appUrl).origin
    const internalOrigin = new URL(request.url).origin
    const corrected = new Request(request.url.replace(internalOrigin, publicOrigin), request)
    return _clerk(corrected)
}

const optionsHandler = metadataCorsOptionsRequestHandler()
export function OPTIONS() {
    return optionsHandler()
}
