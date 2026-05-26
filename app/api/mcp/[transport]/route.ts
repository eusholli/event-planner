import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { verifyClerkToken } from '@clerk/mcp-tools/next'
import { auth } from '@clerk/nextjs/server'
import { getRoleForUser } from '@/lib/mcp/auth'
import { registerReadTools } from '@/lib/mcp/tools/read'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const handler = createMcpHandler(
    (server) => {
        registerReadTools(server)
        // write tools removed — all MCP access is read-only
    },
    {
        serverInfo: { name: 'event-planner-mcp', version: '1.0.0' },
        capabilities: { tools: {} },
    },
    {
        basePath: '/api/mcp',
        maxDuration: 60,
        redisUrl: process.env.REDIS_URL || process.env.KV_URL,
    }
)

const authHandler = withMcpAuth(
    handler,
    async (_req, bearerToken) => {
        // Machine-to-machine: CRON_SECRET_KEY grants read-only access
        // Strip trailing comma: OpenClaw's template engine appends the JSON comma
        // that follows the header value when substituting ${CRON_SECRET_KEY}.
        const cronSecret = process.env.CRON_SECRET_KEY
        const cleanToken = bearerToken?.replace(/,\s*$/, '')
        if (cronSecret && cleanToken && cleanToken === cronSecret && cronSecret.length > 0) {
            return {
                token: cleanToken,
                clientId: 'cron',
                scopes: [],
                extra: { role: 'cron' },
            }
        }

        // Human users: validate as Clerk OAuth token
        const clerkAuth = await auth({ acceptsToken: 'oauth_token' })
        const authInfo = verifyClerkToken(clerkAuth, bearerToken)
        if (!authInfo) return undefined

        // Augment authInfo with the user's app role for use in tool handlers
        const userId = (authInfo.extra as Record<string, unknown> | undefined)?.userId as string | undefined
        if (!userId) return undefined

        const role = await getRoleForUser(userId)
        return {
            ...authInfo,
            extra: { ...(authInfo.extra ?? {}), role },
        }
    },
    {
        required: true,
        resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp',
    }
)

export { authHandler as GET, authHandler as POST }
