
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URL = 'http://localhost:3000'

async function main() {
    console.log('Starting verification of OCCURRED event lock...')

    // 1. Setup: Create a test event
    console.log('Creating test event...')
    const event = await prisma.event.create({
        data: {
            name: 'Test Lock Event',
            slug: 'test-lock-event',
            status: 'COMMITTED', // Start as committed
            startDate: new Date(),
            endDate: new Date(),
            address: '123 Test St'
        }
    })
    console.log(`Created event: ${event.id}`)

    try {
        // Create child resources
        const room = await prisma.room.create({
            data: { name: 'Test Room', capacity: 10, eventId: event.id }
        })
        const attendee = await prisma.attendee.create({
            data: { name: 'Test Attendee', email: `test-${Date.now()}@example.com`, eventId: event.id, company: 'Test Corp', title: 'Tester' }
        })
        const meeting = await prisma.meeting.create({
            data: { title: 'Test Meeting', roomId: room.id, eventId: event.id, status: 'CONFIRMED' }
        })

        // 2. Lock the event
        console.log('Locking event (setting status to OCCURRED)...')
        await prisma.event.update({
            where: { id: event.id },
            data: { status: 'OCCURRED' }
        })

        // 3. Verify Restrictions
        console.log('\n--- Verifying Restrictions ---')

        // Helper to test fetch
        const testRequest = async (method: string, url: string, body?: any, expectedStatus = 403) => {
            const res = await fetch(`${BASE_URL}${url}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            })
            if (res.status === expectedStatus) {
                console.log(`✅ ${method} ${url} blocked as expected (${res.status})`)
                return true
            } else {
                console.error(`❌ ${method} ${url} failed! Expected ${expectedStatus}, got ${res.status}`)
                const text = await res.text()
                console.error('Response:', text)
                return false
            }
        }

        // Test Event Modification
        await testRequest('PATCH', `/api/events/${event.id}`, { name: 'New Name' })

        // Test Event Deletion
        await testRequest('DELETE', `/api/events/${event.id}`)

        // Test Child Creation
        await testRequest('POST', `/api/rooms`, { name: 'New Room', capacity: 5, eventId: event.id })
        await testRequest('POST', `/api/attendees`, { name: 'New Guy', email: 'new@test.com', eventId: event.id })
        await testRequest('POST', `/api/meetings`, { title: 'New Meeting', eventId: event.id })

        // Test Child Modification
        await testRequest('PUT', `/api/rooms/${room.id}`, { name: 'Updated Room' })
        await testRequest('PUT', `/api/attendees/${attendee.id}`, { name: 'Updated name' })
        await testRequest('PUT', `/api/meetings/${meeting.id}`, { title: 'Updated Title' })

        // Test Child Deletion
        await testRequest('DELETE', `/api/rooms/${room.id}`)
        await testRequest('DELETE', `/api/attendees/${attendee.id}`)
        await testRequest('DELETE', `/api/meetings/${meeting.id}`)

        // 4. Verify Unlock Exception
        console.log('\n--- Verifying Unlock ---')
        const unlockRes = await fetch(`${BASE_URL}/api/events/${event.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'COMMITTED' })
        })
        if (unlockRes.ok) {
            console.log('✅ Successfully unlocked event (changed status back to COMMITTED)')
        } else {
            console.error('❌ Failed to unlock event!', await unlockRes.text())
        }

        // 5. Cleanup
        console.log('\nCleaning up...')
        await prisma.event.delete({ where: { id: event.id } })
        console.log('Test event deleted.')

    } catch (e) {
        console.error('Test failed with error:', e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
