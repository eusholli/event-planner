import { test, expect } from '@playwright/test';

test.describe('Backend API Tests', () => {

    test.describe('Settings API', () => {
        test('should get settings', async ({ request }) => {
            const response = await request.get('/api/settings');
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body).toHaveProperty('id');
            expect(body).toHaveProperty('name');
        });

        test('should update settings', async ({ request }) => {
            // First get current settings to have an ID if needed, though usually settings is a singleton or well-known
            const getResponse = await request.get('/api/settings');
            const currentSettings = await getResponse.json();

            const newName = `Updated Event Name ${Date.now()}`;
            const response = await request.post('/api/settings', {
                data: {
                    ...currentSettings,
                    name: newName,
                }
            });
            expect(response.ok()).toBeTruthy();

            const verifyResponse = await request.get('/api/settings');
            const verifyBody = await verifyResponse.json();
            expect(verifyBody.name).toBe(newName);
        });
    });

    test.describe('Rooms API', () => {
        let createdRoomId: string;

        test('should create a room', async ({ request }) => {
            const roomName = `Room ${Date.now()}`;
            const response = await request.post('/api/rooms', {
                data: {
                    name: roomName,
                    capacity: 10,
                    type: 'conference',
                }
            });
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.name).toBe(roomName);
            createdRoomId = body.id;
        });

        test('should list rooms', async ({ request }) => {
            const response = await request.get('/api/rooms');
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(Array.isArray(body)).toBeTruthy();
            expect(body.some((r: any) => r.id === createdRoomId)).toBeTruthy();
        });

        test('should list rooms sorted alphabetically', async ({ request }) => {
            // Create additional rooms to test sorting
            const roomNames = [`Zebra Room ${Date.now()}`, `Alpha Room ${Date.now()}`, `Beta Room ${Date.now()}`];
            for (const name of roomNames) {
                await request.post('/api/rooms', {
                    data: {
                        name: name,
                        capacity: 10,
                        type: 'conference',
                    }
                });
            }

            const response = await request.get('/api/rooms');
            expect(response.ok()).toBeTruthy();
            const body = await response.json();

            // Extract room names from the response
            const responseNames = body.map((r: any) => r.name);

            // Filter only the rooms we just created to verify their relative order
            const relevantRooms = responseNames.filter((name: string) => roomNames.includes(name));

            // Expected order is alphabetical: Alpha, Beta, Zebra
            const sortedRoomNames = [...roomNames].sort();

            // They should appear in the response in the sorted order
            expect(relevantRooms).toEqual(sortedRoomNames);
        });

        test('should update a room', async ({ request }) => {
            if (!createdRoomId) test.skip();
            const newName = `Updated Room ${Date.now()}`;
            const response = await request.put(`/api/rooms/${createdRoomId}`, {
                data: {
                    name: newName,
                    capacity: 20,
                    type: 'classroom'
                }
            });
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.name).toBe(newName);
            expect(body.capacity).toBe(20);
        });

        test('should delete a room', async ({ request }) => {
            if (!createdRoomId) test.skip();
            const response = await request.delete(`/api/rooms/${createdRoomId}`);
            expect(response.ok()).toBeTruthy();

            const listResponse = await request.get('/api/rooms');
            const listBody = await listResponse.json();
            expect(listBody.some((r: any) => r.id === createdRoomId)).toBeFalsy();
        });
    });

    test.describe('Attendees API', () => {
        let createdAttendeeId: string;

        test('should create an attendee', async ({ request }) => {
            const email = `attendee${Date.now()}@example.com`;
            const response = await request.post('/api/attendees', {
                data: {
                    name: 'John Doe',
                    email: email,
                }
            });
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.email).toBe(email);
            createdAttendeeId = body.id;
        });

        test('should list attendees', async ({ request }) => {
            const response = await request.get('/api/attendees');
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(Array.isArray(body)).toBeTruthy();
            expect(body.some((a: any) => a.id === createdAttendeeId)).toBeTruthy();
        });

        test('should update an attendee', async ({ request }) => {
            if (!createdAttendeeId) test.skip();
            const newName = 'Jane Doe';
            const response = await request.put(`/api/attendees/${createdAttendeeId}`, {
                data: {
                    name: newName,
                    email: `updated${Date.now()}@example.com`
                }
            });
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.name).toBe(newName);
        });

        test('should delete an attendee', async ({ request }) => {
            if (!createdAttendeeId) test.skip();
            const response = await request.delete(`/api/attendees/${createdAttendeeId}`);
            expect(response.ok()).toBeTruthy();

            const listResponse = await request.get('/api/attendees');
            const listBody = await listResponse.json();
            expect(listBody.some((a: any) => a.id === createdAttendeeId)).toBeFalsy();
        });
    });

    test.describe('Meetings API', () => {
        let createdMeetingId: string;
        let roomId: string;
        let attendeeId: string;

        test.beforeAll(async ({ request }) => {
            // Create a room and attendee for the meeting
            const roomRes = await request.post('/api/rooms', {
                data: { name: `Meeting Room ${Date.now()}`, capacity: 5, type: 'huddle' }
            });
            const room = await roomRes.json();
            roomId = room.id;

            const attendeeRes = await request.post('/api/attendees', {
                data: { name: 'Meeting Attendee', email: `meeting${Date.now()}@example.com` }
            });
            const attendee = await attendeeRes.json();
            attendeeId = attendee.id;
        });

        test.afterAll(async ({ request }) => {
            // Cleanup
            if (roomId) await request.delete('/api/rooms', { data: { id: roomId } });
            if (attendeeId) await request.delete('/api/attendees', { data: { id: attendeeId } });
        });

        test('should create a meeting', async ({ request }) => {
            const title = `Meeting ${Date.now()}`;
            const startTime = new Date();
            startTime.setHours(startTime.getHours() + 1);
            const endTime = new Date(startTime);
            endTime.setHours(endTime.getHours() + 1);

            const response = await request.post('/api/meetings', {
                data: {
                    title: title,
                    date: startTime.toISOString().split('T')[0],
                    startTime: startTime.toTimeString().substring(0, 5),
                    endTime: endTime.toTimeString().substring(0, 5),
                    roomId: roomId,
                    attendees: [attendeeId],
                }
            });

            // If creation fails, log the body to see why
            if (!response.ok()) {
                console.log(await response.json());
            }
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.title).toBe(title);
            createdMeetingId = body.id;
        });

        test('should list meetings', async ({ request }) => {
            const response = await request.get('/api/meetings');
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(Array.isArray(body)).toBeTruthy();
            expect(body.some((m: any) => m.id === createdMeetingId)).toBeTruthy();
        });

        test('should get a specific meeting', async ({ request }) => {
            if (!createdMeetingId) test.skip();
            const response = await request.get(`/api/meetings/${createdMeetingId}`);
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.id).toBe(createdMeetingId);
        });

        test('should update a meeting', async ({ request }) => {
            if (!createdMeetingId) test.skip();
            const newTitle = `Updated Meeting ${Date.now()}`;
            const response = await request.put(`/api/meetings/${createdMeetingId}`, {
                data: {
                    title: newTitle,
                }
            });
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.title).toBe(newTitle);
        });

        test('should delete a meeting', async ({ request }) => {
            if (!createdMeetingId) test.skip();
            const response = await request.delete(`/api/meetings/${createdMeetingId}`);
            expect(response.ok()).toBeTruthy();

            const listResponse = await request.get('/api/meetings');
            const listBody = await listResponse.json();
            expect(listBody.some((m: any) => m.id === createdMeetingId)).toBeFalsy();
        });
    });
});
