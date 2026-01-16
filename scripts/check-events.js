const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const events = await prisma.event.findMany()
    console.log('Total Events:', events.length)
    events.forEach(e => {
        console.log(`- [${e.id}] ${e.name}: Region="${e.region}", Status="${e.status}", Dates=${e.startDate.toISOString()} - ${e.endDate.toISOString()}`)
    })
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
