import { protectedResourceHandlerClerk, metadataCorsOptionsRequestHandler } from '@clerk/mcp-tools/next'

// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// MCP clients fetch this to discover Clerk as the authorization server.
// This endpoint must remain public (no auth wrapper).

const _clerk = protectedResourceHandlerClerk()

// protectedResourceHandlerClerk derives the resource URL from new URL(request.url).origin.
// Behind Traefik the Next.js server sees the internal bind address (0.0.0.0:3000) instead
// of the public hostname. Use x-forwarded-host/proto (set by Traefik) to reflect the actual
// hostname the client used — this must match what withMcpAuth puts in WWW-Authenticate.
// Fall back to NEXT_PUBLIC_APP_URL only for direct internal access without a proxy.
export function GET(request: Request) {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto')
    const internalOrigin = new URL(request.url).origin

    let publicOrigin: string
    if (forwardedHost) {
        const host = forwardedHost.split(',')[0].trim()
        const proto = forwardedProto?.split(',')[0].trim() || 'https'
        publicOrigin = `${proto}://${host}`
    } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        if (!appUrl) return _clerk(request)
        publicOrigin = new URL(appUrl).origin
    }

    const corrected = new Request(request.url.replace(internalOrigin, publicOrigin), request)
    return _clerk(corrected)
}

const optionsHandler = metadataCorsOptionsRequestHandler()
export function OPTIONS() {
    return optionsHandler()
}
