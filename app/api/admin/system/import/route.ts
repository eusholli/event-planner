import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { createGunzip } from 'zlib'
import { Readable } from 'stream'
import { withAuth, type AuthContext } from '@/lib/with-auth'
import { getDbParams } from '@/lib/db-shell'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handlePOST(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }
        if (!file.name.endsWith('.sql.gz')) {
            return NextResponse.json({ error: 'File must be a .sql.gz file' }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const { host, port, user, password, database } = getDbParams()

        const psql = spawn('psql', [
            '-h', host,
            '-p', port,
            '-U', user,
            '-d', database,
        ], {
            env: { ...process.env, PGPASSWORD: password },
        })

        const stderrChunks: Buffer[] = []
        psql.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

        await new Promise<void>((resolve, reject) => {
            psql.on('close', (code) => {
                if (stderrChunks.length > 0) {
                    console.warn('psql stderr:', Buffer.concat(stderrChunks).toString())
                }
                if (code !== 0) {
                    reject(new Error(`psql exited with code ${code}: ${Buffer.concat(stderrChunks).toString()}`))
                } else {
                    resolve()
                }
            })
            psql.on('error', reject)

            const gunzip = createGunzip()
            gunzip.on('error', reject)

            Readable.from(buffer).pipe(gunzip).pipe(psql.stdin)
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('System import error:', error)
        return NextResponse.json({
            error: 'Failed to restore database',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 })
    }
}

export const POST = withAuth(handlePOST, { requireRole: 'root' }) as any
