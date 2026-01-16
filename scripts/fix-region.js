const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const event = await prisma.event.findFirst({
        where: { name: { contains: 'MWC' } }
    })

    if (event) {
        await prisma.event.update({
            where: { id: event.id },
            data: { region: 'EU/UK' }
        })
        console.log('Updated MWC region to EU/UK')
    } else {
        console.log('Event not found')
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
