import { PrismaClient } from '@prisma/client'

// Force reload for schema updates

const prismaClientSingleton = () => {
  return new PrismaClient()
}

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
  prisma_v2: PrismaClientSingleton | undefined
}

const prisma = globalForPrisma.prisma_v2 ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma
