import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const settings = await prisma.eventSettings.findFirst()
    console.log('Settings:', settings)

    const meetings = await prisma.meeting.findMany()
    console.log('Meetings:', meetings)
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
