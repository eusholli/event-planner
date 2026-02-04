import { test, expect } from '@playwright/test';
import { createTestEvent, deleteTestEvent } from './helpers';

test.describe('Attendees API (System-wide Scoped)', () => {
    let eventId1: string;
    let eventId2: string;
    let createdAttendeeId: string;
    const testEmail = `attendee${Date.now()}@example.com`;

    test.beforeAll(async ({ request }) => {
        const event1 = await createTestEvent(request);
        eventId1 = event1.id;
        const event2 = await createTestEvent(request);
        eventId2 = event2.id;
    });

    test.afterAll(async ({ request }) => {
        if (eventId1) await deleteTestEvent(request, eventId1);
        if (eventId2) await deleteTestEvent(request, eventId2);
        // Cleanup attendee if it still exists
        if (createdAttendeeId) {
            await request.delete(`/api/attendees/${createdAttendeeId}`);
        }
    });

    test('should create an attendee for Event 1', async ({ request }) => {
        const response = await request.post('/api/attendees', {
            multipart: {
                name: 'John Doe',
                email: testEmail,
                title: 'Software Engineer',
                company: 'Acme Corp',
                eventId: eventId1
            }
        });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.email).toBe(testEmail);
        createdAttendeeId = body.id;
    });

    test('should link SAME attendee to Event 2', async ({ request }) => {
        // Post same email to different event
        const response = await request.post('/api/attendees', {
            multipart: {
                name: 'John Doe Modified', // Name change ignored on link usually, or maybe captured? Current logic links only.
                email: testEmail,
                title: 'Software Engineer',
                company: 'Acme Corp',
                eventId: eventId2
            }
        });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.id).toBe(createdAttendeeId); // ID should be same
    });

    test('should list attendee in BOTH events', async ({ request }) => {
        const res1 = await request.get(`/api/attendees?eventId=${eventId1}`);
        const body1 = await res1.json();
        expect(body1.some((a: any) => a.id === createdAttendeeId)).toBeTruthy();

        const res2 = await request.get(`/api/attendees?eventId=${eventId2}`);
        const body2 = await res2.json();
        expect(body2.some((a: any) => a.id === createdAttendeeId)).toBeTruthy();
    });

    test('should UNLINK attendee from Event 1', async ({ request }) => {
        // Delete with eventId param = Unlink
        const response = await request.delete(`/api/attendees/${createdAttendeeId}?eventId=${eventId1}`);
        expect(response.ok()).toBeTruthy();

        // Check Event 1 list - should be gone
        const res1 = await request.get(`/api/attendees?eventId=${eventId1}`);
        const body1 = await res1.json();
        expect(body1.some((a: any) => a.id === createdAttendeeId)).toBeFalsy();

        // Check Event 2 list - should STILL be there
        const res2 = await request.get(`/api/attendees?eventId=${eventId2}`);
        const body2 = await res2.json();
        expect(body2.some((a: any) => a.id === createdAttendeeId)).toBeTruthy();
    });

    test('should allow Global Update', async ({ request }) => {
        const newName = 'John Updated';
        const response = await request.put(`/api/attendees/${createdAttendeeId}`, {
            multipart: {
                name: newName,
                title: 'Senior Tester',
                company: 'Acme Corp',
                email: testEmail,
            }
        });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.name).toBe(newName);
    });

    test('should SYSTEM DELETE attendee', async ({ request }) => {
        // Delete without param
        const response = await request.delete(`/api/attendees/${createdAttendeeId}`);
        expect(response.ok()).toBeTruthy();

        // Check Event 2 list - should be gone now
        const res2 = await request.get(`/api/attendees?eventId=${eventId2}`);
        const body2 = await res2.json();
        expect(body2.some((a: any) => a.id === createdAttendeeId)).toBeFalsy();
    });
});
