import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = `${process.env.READ_ONLY_DATABASE_URL}`

const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1') ||
  process.env.DATABASE_SSL === 'false'

let cleanedConnectionString = connectionString
if (!isLocal) {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('sslmode')
    cleanedConnectionString = url.toString()
  } catch {
    // leave connectionString as-is if parsing fails
  }
}

// Hard cap at 3 connections — prevents an aggressive LLM from starving the DB pool.
// (pg Pool ignores connection_limit URL params; max must be set on the Pool constructor.)
const readOnlyPool = new Pool({
  connectionString: cleanedConnectionString,
  max: 3,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
})

const adapter = new PrismaPg(readOnlyPool)

const prismaReadOnlyClientSingleton = () => new PrismaClient({ adapter })

type PrismaReadOnlyClient = ReturnType<typeof prismaReadOnlyClientSingleton>

const globalForPrismaReadOnly = globalThis as unknown as {
  prismaReadOnly: PrismaReadOnlyClient | undefined
}

const prismaReadOnly =
  globalForPrismaReadOnly.prismaReadOnly ?? prismaReadOnlyClientSingleton()

export default prismaReadOnly

if (process.env.NODE_ENV !== 'production') {
  globalForPrismaReadOnly.prismaReadOnly = prismaReadOnly
}
