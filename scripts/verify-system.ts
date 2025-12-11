import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const API_URL = 'http://localhost:3000/api'

async function main() {
    console.log('🚀 Starting Automated System Verification (Integration Tests)...')

    // 1. Setup: Create Test Resources
    console.log('\n[Setup] Creating test resources...')
    const room = await prisma.room.create({
        data: { name: 'Integration Test Room', capacity: 10 }
    })
    const attendee = await prisma.attendee.create({
        data: { name: 'Integration User', email: 'integration@test.com', company: 'Test Corp', title: 'Tester' }
    })
    console.log(`Created Room: ${room.name} (${room.id})`)
    console.log(`Created Attendee: ${attendee.name} (${attendee.id})`)

    const startTime = new Date()
    startTime.setHours(10, 0, 0, 0)
    // Ensure it's tomorrow to avoid past date issues if any validation exists
    startTime.setDate(startTime.getDate() + 1)

    const endTime = new Date(startTime)
    endTime.setHours(11, 0, 0, 0)

    let meetingId: string = ''

    try {
        // 2. Scenario: Create Meeting via API
        console.log('\n[Scenario 1] Create Meeting (API)')
        const createRes = await fetch(`${API_URL}/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Integration Meeting',
                purpose: 'Testing API',
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                roomId: room.id,
                attendeeIds: [attendee.id]
            })
        })

        if (createRes.ok) {
            const meeting = await createRes.json()
            meetingId = meeting.id
            console.log('✅ API returned 200 OK. Meeting created.')
            if (meeting.sequence === 0) console.log('✅ Sequence initialized to 0.')
        } else {
            console.error(`❌ FAILED: API returned ${createRes.status} ${createRes.statusText}`)
            const err = await createRes.text()
            console.error(err)
            throw new Error('Create failed')
        }

        // 3. Scenario: Conflict Detection (API)
        console.log('\n[Scenario 2] Conflict Detection (API)')
        const conflictRes = await fetch(`${API_URL}/meetings/check-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                roomId: room.id,
                attendeeIds: [attendee.id]
            })
        })

        const conflictData = await conflictRes.json()
        if (conflictData.conflicts && conflictData.conflicts.length > 0) {
            console.log('✅ API correctly returned conflicts:', conflictData.conflicts)
        } else {
            console.error('❌ FAILED: API did not report conflicts for overlapping time.')
        }

        if (conflictData.suggestions && conflictData.suggestions.length > 0) {
            console.log('✅ API returned smart suggestions:', conflictData.suggestions.map((s: any) => s.label))
        } else {
            console.warn('⚠️ WARNING: No suggestions returned (might be expected if no other rooms/times available).')
        }

        // 4. Scenario: Update Meeting (API)
        console.log('\n[Scenario 3] Update Meeting (API)')
        const updateRes = await fetch(`${API_URL}/meetings/${meetingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Integration Meeting (Updated)',
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                roomId: room.id,
                attendeeIds: [attendee.id]
            })
        })

        if (updateRes.ok) {
            const updated = await updateRes.json()
            console.log('✅ API returned 200 OK. Meeting updated.')
            if (updated.sequence === 1) {
                console.log('✅ Sequence incremented to 1.')
            } else {
                console.error(`❌ FAILED: Sequence is ${updated.sequence}, expected 1.`)
            }
        } else {
            console.error(`❌ FAILED: API returned ${updateRes.status}`)
            const err = await updateRes.text()
            console.error('Error details:', err)
        }

        // 5. Scenario: Delete Meeting (API)
        console.log('\n[Scenario 4] Delete Meeting (API)')
        const deleteRes = await fetch(`${API_URL}/meetings/${meetingId}`, {
            method: 'DELETE'
        })

        if (deleteRes.ok) {
            console.log('✅ API returned 200 OK. Meeting deleted.')
        } else {
            console.error(`❌ FAILED: API returned ${deleteRes.status}`)
        }

        // Verify deletion in DB
        const check = await prisma.meeting.findUnique({ where: { id: meetingId } })
        if (!check) {
            console.log('✅ Verified meeting is gone from DB.')
        } else {
            console.error('❌ FAILED: Meeting still exists in DB.')
        }

    } catch (error) {
        console.error('Test Suite Failed:', error)
    } finally {
        // 6. Cleanup
        console.log('\n[Cleanup] Removing test resources...')
        // Try to delete meeting if it still exists (in case of error)
        if (meetingId) {
            try { await prisma.meeting.delete({ where: { id: meetingId } }) } catch { }
        }
        await prisma.room.delete({ where: { id: room.id } })
        await prisma.attendee.delete({ where: { id: attendee.id } })
        console.log('✅ Cleanup complete.')

        await prisma.$disconnect()
        console.log('\n🎉 Integration Verification Finished.')
    }
}

main()
