import { existsSync } from 'fs'

// Resolve pg_dump binary — prefer postgresql@15 explicit paths over whatever
// is on PATH (which may be an older version if postgresql@15 isn't brew-linked).
export function getPgDumpPath(): string {
    const candidates = [
        '/opt/homebrew/opt/postgresql@15/bin/pg_dump',  // Apple Silicon Homebrew
        '/usr/local/opt/postgresql@15/bin/pg_dump',      // Intel Mac Homebrew
    ]
    for (const p of candidates) {
        if (existsSync(p)) return p
    }
    return 'pg_dump' // fall back to PATH
}

export function getDbParams() {
    const raw = process.env.POSTGRES_PRISMA_URL
    if (!raw) throw new Error('POSTGRES_PRISMA_URL is not set')

    const url = new URL(raw)
    return {
        host: url.hostname,
        port: url.port || '5432',
        user: url.username,
        password: decodeURIComponent(url.password),
        // Strip any query params (e.g. pgbouncer, sslmode) from the database name
        database: url.pathname.slice(1).split('?')[0],
    }
}

export function getBackupFilename() {
    const { database } = getDbParams()
    const ts = new Date().toISOString()
        .replace('T', '-')
        .replace(/:/g, '-')
        .replace(/\..+/, '')
    return `${database}-${ts}.sql.gz`
}
