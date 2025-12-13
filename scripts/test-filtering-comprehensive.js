
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('🚀 Starting Comprehensive API Filtering Tests...\n');
    let attendeeId = null;
    let meetings = [];

    // Helper
    const request = async (url, method = 'GET', body = null) => {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(`${BASE_URL}${url}`, options);
        // If DELETE returns 200 but verify fails, we want text
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            return { error: 'Invalid JSON', text };
        }
    };

    try {
        // 1. Get an Attendee
        console.log('📦 Setup: Fetching Attendee...');
        const attendees = await request('/api/attendees');
        if (!Array.isArray(attendees) || attendees.length === 0) {
            throw new Error('No attendees found. Cannot run tests requiring attendee validation.');
        }
        attendeeId = attendees[0].id;
        console.log(`   ✅ Using attendee: ${attendeeId}`);

        // 2. Create Test Data
        console.log('📦 Setup: Creating Test Meetings...');
        const testData = [
            {
                title: "Test Meeting A - Alpha",
                purpose: "Discuss Alpha",
                date: "2029-10-10",
                startTime: "09:00",
                endTime: "10:00",
                location: "External Cafe",
                status: "STARTED",
                tags: ["Urgent"],
                attendeeIds: [attendeeId]
            },
            {
                title: "Test Meeting B - Beta",
                purpose: "Review Beta",
                date: "2029-10-10",
                startTime: "11:00",
                endTime: "12:00",
                location: "External Office",
                status: "COMPLETED",
                tags: ["Review"],
                attendeeIds: [attendeeId]
            },
            {
                title: "Test Meeting C - Charlie",
                purpose: "Kickoff Alpha",
                date: "2029-10-11",
                startTime: "09:00",
                endTime: "10:00",
                location: "Home",
                status: "CANCELED",
                tags: ["Planning"],
                attendeeIds: [attendeeId]
            }
        ];

        for (const data of testData) {
            const res = await request('/api/meetings', 'POST', data);
            if (res.error) throw new Error(`Failed to create meeting: ${res.error}`);
            meetings.push(res);
            console.log(`   + Created: ${res.title} (ID: ${res.id})`);
        }

        // 3. Run Tests
        const runTest = async (name, url, checkFn) => {
            console.log(`\n🧪 Test: ${name}`);
            console.log(`   URL: ${url}`);
            const res = await request(url);
            if (res.error) {
                console.log(`   ❌ Failed: API Error - ${res.error}`);
                return;
            }
            const filtered = res.filter(m => meetings.some(tm => tm.id === m.id)); // Only check OUR test meetings
            if (checkFn(filtered)) {
                console.log(`   ✅ Passed (Found ${filtered.length} relevant meetings)`);
            } else {
                console.log(`   ❌ Failed. Got: ${filtered.map(m => m.title).join(', ')}`);
            }
        };

        await runTest(
            'Filter by Date (2029-10-10)',
            '/api/meetings?date=2029-10-10',
            (res) => res.length === 2 && res.some(m => m.title.includes('Meeting A')) && res.some(m => m.title.includes('Meeting B'))
        );

        await runTest(
            'Filter by Status (STARTED)',
            '/api/meetings?status=STARTED',
            (res) => res.length === 1 && res[0].title.includes('Meeting A')
        );

        await runTest(
            'Filter by Multiple Statuses (STARTED, COMPLETED)',
            '/api/meetings?status=STARTED,COMPLETED',
            (res) => res.length === 2 && !res.some(m => m.title.includes('Meeting C'))
        );

        await runTest(
            'Filter by Search ("Alpha")',
            '/api/meetings?search=Alpha',
            (res) => res.length === 2 && res.some(m => m.title.includes('Meeting A')) && res.some(m => m.title.includes('Meeting C'))
        );

        await runTest(
            'Filter by Tags ("Review")',
            '/api/meetings?tags=Review',
            (res) => res.length === 1 && res[0].title.includes('Meeting B')
        );

        await runTest(
            'Composite: Date + Status (2029-10-10 + COMPLETED)',
            '/api/meetings?date=2029-10-10&status=COMPLETED',
            (res) => res.length === 1 && res[0].title.includes('Meeting B')
        );

        await runTest(
            'Composite: Search + Tag ("Unknown" + "Urgent") - Should be empty',
            '/api/meetings?search=Unknown&tags=Urgent',
            (res) => res.length === 0
        );

    } catch (e) {
        console.error('💥 Critical Error:', e);
    } finally {
        // 4. Cleanup
        console.log('\n🧹 Cleanup: Deleting Test Meetings...');
        for (const m of meetings) {
            await request(`/api/meetings/${m.id}`, 'DELETE');
            console.log(`   - Deleted ${m.id}`);
        }
    }
}

runTests();
