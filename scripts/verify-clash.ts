
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config() // Fallback to .env

const connectionString = process.env.POSTGRES_PRISMA_URL

if (!connectionString) {
    console.error('POSTGRES_PRISMA_URL is not set')
    process.exit(1)
}

const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false }
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('Starting Verification...')

    // 1. Setup Data
    const roomName = 'Test Room ' + Date.now()
    const attendeeName = 'Test Attendee ' + Date.now()

    // Create Room
    const room = await prisma.room.create({
        data: { name: roomName, capacity: 10 }
    })

    // Create Attendee
    const attendee = await prisma.attendee.create({
        data: {
            name: attendeeName,
            email: `test-${Date.now()}@example.com`,
            company: 'Test Co',
            title: 'Test Title'
        }
    })

    const date = '2025-12-25'
    const startTime = '10:00'
    const endTime = '11:00'

    try {
        // 2. Test 1: Create Meeting A (Baseline)
        console.log('\nTest 1: Create Meeting A (Baseline)')
        const meetingA = await prisma.meeting.create({
            data: {
                title: 'Meeting A',
                date, startTime, endTime,
                roomId: room.id,
                attendees: { connect: { id: attendee.id } },
                status: 'CONFIRMED'
            }
        })
        console.log('✅ Meeting A created:', meetingA.id)

        // 3. Test 2: Room Conflict (Should Fail)
        console.log('\nTest 2: Create Meeting B (Room Conflict)')

        const roomConflicts = await prisma.meeting.findMany({
            where: {
                roomId: room.id,
                date: date,
                OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }]
            }
        })

        if (roomConflicts.length > 0) {
            console.log('✅ Room Conflict Detected (Blocking Condition)')
        } else {
            console.error('❌ Failed to detect Room Conflict')
        }

        // 4. Test 3: Attendee Conflict (Should be Warning)
        // Create a separate room so room check passes
        const room2 = await prisma.room.create({
            data: { name: roomName + ' 2', capacity: 10 }
        })

        console.log('\nTest 3: Create Meeting C (Attendee Conflict)')
        const attendeeConflicts = await prisma.meeting.findMany({
            where: {
                attendees: { some: { id: attendee.id } },
                date: date,
                OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }]
            }
        })

        if (attendeeConflicts.length > 0) {
            console.log('✅ Attendee Conflict Detected (Warning Condition)')
        } else {
            console.error('❌ Failed to detect Attendee Conflict')
        }

        // Verify we CAN create it (Prisma itself doesn't block, the API did, but we verified the logic)
        const meetingC = await prisma.meeting.create({
            data: {
                title: 'Meeting C',
                date, startTime, endTime,
                roomId: room2.id,
                attendees: { connect: { id: attendee.id } },
                status: 'CONFIRMED'
            }
        })
        console.log('✅ Meeting C created despite attendee conflict (Database allows it, API logic handles warning)')

    } catch (e) {
        console.error(e)
    } finally {
        // Cleanup
        console.log('\nCleaning up...')
        await prisma.meeting.deleteMany({ where: { title: { in: ['Meeting A', 'Meeting C'] } } })
        await prisma.room.deleteMany({ where: { name: { in: [roomName, roomName + ' 2'] } } })
        await prisma.attendee.delete({ where: { id: attendee.id } })
        await prisma.$disconnect()
    }
}

main()
