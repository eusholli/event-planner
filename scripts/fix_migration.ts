import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        const result = await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations" WHERE migration_name LIKE '%20251214194305_rename_gemini_to_openrouter%'`)
        console.log(`Deleted ${result} bad migration record(s)`)
    } catch (e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
