import { readFileSync } from 'fs'
import { join } from 'path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import prismaReadOnly from '@/lib/prisma-readonly'
import { canRead } from '@/lib/mcp/auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRole(extra: unknown): string {
    return (extra as Record<string, unknown>)?.role as string ?? ''
}

function forbidden() {
    return {
        content: [{ type: 'text' as const, text: 'Forbidden: requires root, marketing, or cron role' }],
        isError: true,
    }
}

function ok(data: unknown) {
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
}

function okText(text: string) {
    return {
        content: [{ type: 'text' as const, text }],
    }
}

// ── Read Tools ────────────────────────────────────────────────────────────────

export function registerReadTools(server: McpServer) {

    server.registerTool(
        'get_database_schema',
        {
            title: 'Get Database Schema',
            description:
                'Returns the Prisma schema for this server\'s internal Rakuten Symphony event database. ' +
                'Use this first to understand available tables and their fields before writing SQL. ' +
                'SCOPE: internal event logistics and ROI data only — events, attendees, companies, meetings, rooms, ' +
                'pitches, ROI targets, marketing checklists, LinkedIn drafts, intelligence reports, system settings. ' +
                'DO NOT use for external market research or real-time competitive intelligence.',
            inputSchema: {},
        },
        async (_args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()
            const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
            const schema = readFileSync(schemaPath, 'utf-8')
            return okText(schema)
        }
    )

    server.registerTool(
        'execute_read_only_sql',
        {
            title: 'Execute Read-Only SQL',
            description:
                'Executes a raw SELECT query against the internal Rakuten Symphony event database using a read-only PostgreSQL role. ' +
                'Only SELECT and WITH (CTE) statements are accepted — any mutation or DDL attempt is rejected before execution. ' +
                'Results are capped at 100 rows; use LIMIT and OFFSET clauses to paginate through larger datasets. ' +
                'On SQL error, the raw PostgreSQL error string is returned in the response so you can self-correct and retry. ' +
                'SCOPE: internal event data only — this database contains no external market intelligence.',
            inputSchema: {
                sql: z.string().describe('A SELECT or WITH (CTE) SQL statement to execute against the event database'),
            },
        },
        async (args, { authInfo }) => {
            if (!canRead(getRole(authInfo?.extra))) return forbidden()

            if (!process.env.READ_ONLY_DATABASE_URL) {
                return okText(JSON.stringify({
                    error: 'READ_ONLY_DATABASE_URL is not configured. Create the read_only_agent PostgreSQL role and set this environment variable to enable dynamic SQL.',
                }))
            }

            // Validate: only SELECT or WITH allowed
            const normalized = args.sql.trim().toLowerCase()
            if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
                return okText(JSON.stringify({
                    error: 'Only SELECT and WITH (CTE) statements are permitted. Mutation and DDL statements are rejected.',
                }))
            }

            try {
                const rows = await prismaReadOnly.$queryRawUnsafe(args.sql) as unknown[]
                const truncated = rows.length > 100
                const result = truncated ? rows.slice(0, 100) : rows
                const payload: Record<string, unknown> = { rows: result }
                if (truncated) {
                    payload._truncated = true
                    payload._note = 'Result capped at 100 rows. Use LIMIT and OFFSET to paginate.'
                }
                return okText(JSON.stringify(payload, null, 2))
            } catch (e: any) {
                return okText(JSON.stringify({ error: e.message }))
            }
        }
    )
}
