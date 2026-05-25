import { protectedResourceHandlerClerk, metadataCorsOptionsRequestHandler } from '@clerk/mcp-tools/next'

// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// MCP clients fetch this to discover Clerk as the authorization server.
// This endpoint must remain public (no auth wrapper).
export const GET = protectedResourceHandlerClerk()

const optionsHandler = metadataCorsOptionsRequestHandler()
export function OPTIONS() {
    return optionsHandler()
}
