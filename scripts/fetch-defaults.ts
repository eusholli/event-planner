
import prisma from '../lib/prisma'

async function main() {
    const settings = await prisma.systemSettings.findFirst();
    console.log('System Settings:', JSON.stringify(settings, null, 2));

    // Also checking if there are any events to see what statuses exist, though not relying on it if empty
    const events = await prisma.event.findMany({ select: { status: true } });
    console.log('Existing Event Statuses:', [...new Set(events.map(e => e.status))]);
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
