import { test, expect } from '@playwright/test';
import { createTestEvent, deleteTestEvent } from './helpers';

test.describe('Events API', () => {
    let createdEventId: string;

    test.afterAll(async ({ request }) => {
        if (createdEventId) {
            await deleteTestEvent(request, createdEventId);
        }
    });

    test('should create an event', async ({ request }) => {
        const timestamp = Date.now();
        const eventName = `New Event ${timestamp}`;

        const response = await request.post('/api/events', {
            data: {
                name: eventName,
                url: `https://test-event-${timestamp}.com`,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 86400000).toISOString(),
                region: 'EU_UK',
                status: 'PIPELINE',
                budget: 5000,
                targetCustomers: 'Developers',
                expectedRoi: 'Medium'
            }
        });

        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.name).toBe(eventName);
        expect(body.id).toBeDefined();
        createdEventId = body.id;
    });

    test('should list events', async ({ request }) => {
        const response = await request.get('/api/events');
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(Array.isArray(body)).toBeTruthy();
        expect(body.some((e: any) => e.id === createdEventId)).toBeTruthy();
    });

    test('should get a specific event', async ({ request }) => {
        if (!createdEventId) test.skip();
        const response = await request.get(`/api/events/${createdEventId}`);
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.id).toBe(createdEventId);
    });

    test('should update an event', async ({ request }) => {
        if (!createdEventId) test.skip();
        const newName = `Updated Event ${Date.now()}`;
        const response = await request.patch(`/api/events/${createdEventId}`, {
            data: {
                name: newName,
                status: 'COMMITTED'
            }
        });

        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.name).toBe(newName);
        expect(body.status).toBe('COMMITTED');
    });

    test('should delete an event', async ({ request }) => {
        // Create a temporary event to delete so we don't mess up other tests
        const tempEvent = await createTestEvent(request);

        const response = await request.delete(`/api/events/${tempEvent.id}`);
        expect(response.ok()).toBeTruthy();

        const getResponse = await request.get(`/api/events/${tempEvent.id}`);
        expect(getResponse.status()).toBe(404); // Assuming 404 for not found
    });
});
