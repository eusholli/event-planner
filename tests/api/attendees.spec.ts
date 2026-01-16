import { test, expect } from '@playwright/test';
import { createTestEvent, deleteTestEvent } from './helpers';

test.describe('Attendees API (Scoped)', () => {
    let eventId: string;
    let createdAttendeeId: string;

    test.beforeAll(async ({ request }) => {
        const event = await createTestEvent(request);
        eventId = event.id;
    });

    test.afterAll(async ({ request }) => {
        if (eventId) {
            await deleteTestEvent(request, eventId);
        }
    });

    test('should create an attendee for the event', async ({ request }) => {
        const email = `attendee${Date.now()}@example.com`;
        const response = await request.post('/api/attendees', {
            multipart: {
                name: 'John Doe',
                email: email,
                title: 'Software Engineer', // Required
                company: 'Acme Corp',     // Required
                eventId: eventId
            }
        });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.email).toBe(email);
        expect(body.eventId).toBe(eventId);
        createdAttendeeId = body.id;
    });

    test('should list attendees for the event', async ({ request }) => {
        const response = await request.get(`/api/attendees?eventId=${eventId}`);
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(Array.isArray(body)).toBeTruthy();
        expect(body.some((a: any) => a.id === createdAttendeeId)).toBeTruthy();
    });

    test('should NOT list attendees for another event', async ({ request }) => {
        const otherEvent = await createTestEvent(request);

        const response = await request.get(`/api/attendees?eventId=${otherEvent.id}`);
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.some((a: any) => a.id === createdAttendeeId)).toBeFalsy();

        await deleteTestEvent(request, otherEvent.id);
    });

    test('should update an attendee', async ({ request }) => {
        if (!createdAttendeeId) test.skip();
        const newName = 'Jane Doe';
        // Needs all required fields
        const response = await request.put(`/api/attendees/${createdAttendeeId}`, {
            multipart: {
                name: newName,
                title: 'Senior Tester',
                company: 'Acme Corp',
                email: 'updated@example.com',
                // Keep eventId consistent if needed, though route might not check it for update, but good practice
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

        const listResponse = await request.get(`/api/attendees?eventId=${eventId}`);
        const listBody = await listResponse.json();
        expect(listBody.some((a: any) => a.id === createdAttendeeId)).toBeFalsy();
    });
});
