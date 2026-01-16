import { test, expect } from '@playwright/test';
import { createTestEvent, deleteTestEvent } from './helpers';

test.describe('Rooms API (Scoped)', () => {
    let eventId: string;
    let createdRoomId: string;

    test.beforeAll(async ({ request }) => {
        const event = await createTestEvent(request);
        eventId = event.id;
    });

    test.afterAll(async ({ request }) => {
        if (eventId) {
            await deleteTestEvent(request, eventId);
        }
    });

    test('should create a room for the event', async ({ request }) => {
        const roomName = `Room ${Date.now()}`;
        const response = await request.post('/api/rooms', {
            data: {
                name: roomName,
                capacity: 10,
                type: 'conference',
                eventId: eventId
            }
        });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.name).toBe(roomName);
        expect(body.eventId).toBe(eventId);
        createdRoomId = body.id;
    });

    test('should list rooms for the event', async ({ request }) => {
        const response = await request.get(`/api/rooms?eventId=${eventId}`);
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(Array.isArray(body)).toBeTruthy();
        expect(body.some((r: any) => r.id === createdRoomId)).toBeTruthy();
    });

    test('should NOT list rooms for another event', async ({ request }) => {
        const otherEvent = await createTestEvent(request);

        const response = await request.get(`/api/rooms?eventId=${otherEvent.id}`);
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.some((r: any) => r.id === createdRoomId)).toBeFalsy();

        await deleteTestEvent(request, otherEvent.id);
    });

    test('should update a room', async ({ request }) => {
        if (!createdRoomId) test.skip();
        const newName = `Updated Room ${Date.now()}`;
        const response = await request.put(`/api/rooms/${createdRoomId}`, {
            data: {
                name: newName,
                capacity: 20
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

        const listResponse = await request.get(`/api/rooms?eventId=${eventId}`);
        const listBody = await listResponse.json();
        expect(listBody.some((r: any) => r.id === createdRoomId)).toBeFalsy();
    });
});
