import { PrismaClient } from '@prisma/client'

// Force reload for schema updates

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = `${process.env.POSTGRES_PRISMA_URL}`

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
const pool = new Pool({
  connectionString: isLocal ? connectionString : connectionString.replace(/(\?|&)sslmode=[^&]+/, ''),
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)

const prismaClientSingleton = () => {
  return new PrismaClient({ adapter })
}

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
  prisma_v2: PrismaClientSingleton | undefined
}

const prisma = globalForPrisma.prisma_v2 ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma
