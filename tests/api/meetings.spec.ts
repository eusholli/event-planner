import { test, expect } from '@playwright/test';
import { createTestEvent, deleteTestEvent } from './helpers';

test.describe('Meetings API (Scoped)', () => {
    let eventId: string;
    let roomId: string;
    let attendeeId: string;
    let createdMeetingId: string;

    test.beforeAll(async ({ request }) => {
        const event = await createTestEvent(request);
        eventId = event.id;

        // Create Room
        const roomRes = await request.post('/api/rooms', {
            data: { name: `Meeting Room`, capacity: 5, type: 'huddle', eventId }
        });
        const room = await roomRes.json();
        roomId = room.id;

        // Create Attendee
        const attendeeRes = await request.post('/api/attendees', {
            multipart: {
                name: 'Meeting Attendee',
                email: `meeting${Date.now()}@example.com`,
                title: 'Tester',
                company: 'Test Corp',
                eventId
            }
        });
        const attendee = await attendeeRes.json();
        attendeeId = attendee.id;
    });

    test.afterAll(async ({ request }) => {
        if (eventId) {
            await deleteTestEvent(request, eventId);
        }
    });

    test('should create a meeting for the event', async ({ request }) => {
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
                eventId: eventId
            }
        });

        if (!response.ok()) {
            console.log(await response.json());
        }
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.title).toBe(title);
        expect(body.eventId).toBe(eventId);
        createdMeetingId = body.id;
    });

    test('should list meetings for the event', async ({ request }) => {
        const response = await request.get(`/api/meetings?eventId=${eventId}`);
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.some((m: any) => m.id === createdMeetingId)).toBeTruthy();
    });

    test('should NOT list meetings for another event', async ({ request }) => {
        const otherEvent = await createTestEvent(request);

        const response = await request.get(`/api/meetings?eventId=${otherEvent.id}`);
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.some((m: any) => m.id === createdMeetingId)).toBeFalsy();

        await deleteTestEvent(request, otherEvent.id);
    });

    test('should delete a meeting', async ({ request }) => {
        if (!createdMeetingId) test.skip();
        const response = await request.delete(`/api/meetings/${createdMeetingId}`);
        expect(response.ok()).toBeTruthy();

        const listResponse = await request.get(`/api/meetings?eventId=${eventId}`);
        const listBody = await listResponse.json();
        expect(listBody.some((m: any) => m.id === createdMeetingId)).toBeFalsy();
    });
});
