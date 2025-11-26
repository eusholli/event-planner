
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function verify() {
    console.log('Starting verification...')

    // Clean up previous test data
    await prisma.meeting.deleteMany({
        where: { title: { startsWith: 'Refactor Test' } }
    })

    // 1. Create a meeting with Date, Start Time, End Time
    console.log('\n1. Creating meeting with full date and time...')
    const meeting1 = await prisma.meeting.create({
        data: {
            title: 'Refactor Test - Full',
            date: '2025-12-25',
            startTime: '10:00',
            endTime: '11:00',
            status: 'STARTED'
        }
    })
    console.log('Created:', meeting1)
    if (meeting1.date !== '2025-12-25' || meeting1.startTime !== '10:00') {
        throw new Error('Meeting 1 data mismatch')
    }

    // 2. Create a meeting with Date only
    console.log('\n2. Creating meeting with Date only...')
    const meeting2 = await prisma.meeting.create({
        data: {
            title: 'Refactor Test - Date Only',
            date: '2025-12-26',
            status: 'STARTED'
        }
    })
    console.log('Created:', meeting2)
    if (meeting2.date !== '2025-12-26' || meeting2.startTime !== null) {
        throw new Error('Meeting 2 data mismatch')
    }

    // 3. Test Conflict Logic
    console.log('\n3. Testing Conflict Logic...')
    // Create a room
    const room = await prisma.room.create({
        data: {
            name: 'Refactor Room',
            capacity: 10
        }
    })

    // Book the room
    await prisma.meeting.create({
        data: {
            title: 'Refactor Test - Room Booking',
            date: '2025-12-25',
            startTime: '10:00',
            endTime: '11:00',
            roomId: room.id
        }
    })

    // Try to book overlapping
    const conflictingMeeting = await prisma.meeting.findMany({
        where: {
            roomId: room.id,
            date: '2025-12-25',
            OR: [
                { startTime: { lt: '10:30' }, endTime: { gt: '10:00' } }
            ]
        }
    })

    console.log('Conflicting meetings found:', conflictingMeeting.length)
    if (conflictingMeeting.length === 0) {
        throw new Error('Failed to detect conflict')
    }

    // Clean up
    await prisma.meeting.deleteMany({
        where: { title: { startsWith: 'Refactor Test' } }
    })
    await prisma.room.delete({ where: { id: room.id } })

    console.log('\nVerification successful!')
}

verify()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
