
import { APIRequestContext, expect } from '@playwright/test';

export async function createEventViaApi(request: APIRequestContext) {
    const res = await request.post('/api/events', {
        data: {
            name: `E2E Helper Event ${Date.now()}`
        }
    });
    expect(res.ok()).toBeTruthy();
    const event = await res.json();
    return { id: event.id, name: event.name };
}

export async function createRoomViaApi(request: APIRequestContext, eventId: string) {
    const res = await request.post('/api/rooms', {
        data: {
            name: `Helper Room ${Date.now()}`,
            capacity: 10,
            eventId
        }
    });
    expect(res.ok()).toBeTruthy();
    const room = await res.json();
    return { id: room.id, name: room.name };
}

export async function createAttendeeViaApi(request: APIRequestContext, eventId: string) {
    // Attendees API expects FormData
    // Playwright request.post multipart support
    const name = `Helper User ${Date.now()}`;
    const email = `helper${Date.now()}@example.com`;

    // We can simulate FormData with `multipart` option in Playwright
    const res = await request.post('/api/attendees', {
        multipart: {
            name: name,
            email: email,
            title: 'Helper',
            company: 'Helper Corp',
            eventId: eventId,
            type: 'VIP'
        }
    });
    // API might return 400 if validation fails, ensure we check
    if (!res.ok()) {
        console.error('Create Attendee Failed:', await res.text());
    }
    expect(res.ok()).toBeTruthy();
    const attendee = await res.json();
    // The API response body contains the created attendee object, which includes 'name'
    return { id: attendee.id, name: attendee.name, email: attendee.email };
}

export async function deleteEventViaApi(request: APIRequestContext, eventId: string) {
    // Requires delete permission or just unsecured API if internal
    // If secured, we might need headers or setup.
    // Assuming development environment or unsecured for now based on 'app/events/page.tsx' not showing complex auth in fetch calls explicitely in the snippet (it relied on session).
    // We might need to handle auth. 
    // For now, let's assume the test runner has session or we skip delete if tricky, 
    // letting the DB clean up or using a clean script.
    // Actually, createEventViaApi also needs auth if protected.
    // If the tests fail with 401, we need to handle login.

    // For now, let's try.
    const res = await request.delete(`/api/events/${eventId}`);
    return res.ok();
}
