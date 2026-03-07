process.loadEnvFile('.env')

async function main() {
    const { default: prisma } = await import('./lib/prisma')

    // Clean up leftover companies
    await prisma.company.deleteMany()

    const counts = {
        events: await prisma.event.count(),
        companies: await prisma.company.count(),
        attendees: await prisma.attendee.count(),
        rooms: await prisma.room.count(),
        meetings: await prisma.meeting.count(),
        roiTargets: await prisma.eventROITargets.count(),
    }
    console.log('Database Record Counts:')
    console.table(counts)
    await prisma.$disconnect()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
