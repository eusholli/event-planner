import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { createGzip } from 'zlib'
import { withAuth, type AuthContext } from '@/lib/with-auth'
import { getDbParams, getBackupFilename, getPgDumpPath } from '@/lib/db-shell'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const { host, port, user, password, database } = getDbParams()
        const filename = getBackupFilename()

        const pgdump = spawn(getPgDumpPath(), [
            '--clean',
            '--if-exists',
            '-h', host,
            '-p', port,
            '-U', user,
            database,
        ], {
            env: { ...process.env, PGPASSWORD: password },
        })

        const gzip = createGzip()
        pgdump.stdout.pipe(gzip)
        pgdump.stderr.on('data', (data) => console.error('pg_dump:', data.toString()))

        const stream = new ReadableStream({
            start(controller) {
                gzip.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk)))
                gzip.on('end', () => controller.close())
                gzip.on('error', (err) => controller.error(err))
                pgdump.on('error', (err) => controller.error(err))
                pgdump.on('close', (code) => {
                    if (code !== 0) controller.error(new Error(`pg_dump exited with code ${code}`))
                })
            },
        })

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        })
    } catch (error) {
        console.error('System export error:', error)
        return NextResponse.json({ error: 'Failed to export system' }, { status: 500 })
    }
}

export const GET = withAuth(handleGET, { requireRole: 'root' }) as any
