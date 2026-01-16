import { APIRequestContext } from '@playwright/test';

export async function createTestEvent(request: APIRequestContext) {
    const timestamp = Date.now();
    const eventName = `Test Event ${timestamp}`;
    const response = await request.post('/api/events', {
        data: {
            name: eventName,
            url: `https://example.com/event-${timestamp}`,
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 86400000).toISOString(), // +1 day
            region: 'NA',
            status: 'PIPELINE',
            budget: 10000,
            targetCustomers: 'Tech Enthusiasts',
            expectedRoi: 'High'
        }
    });

    if (!response.ok()) {
        throw new Error(`Failed to create test event: ${await response.text()}`);
    }

    return await response.json();
}

export async function deleteTestEvent(request: APIRequestContext, eventId: string) {
    const response = await request.delete(`/api/events/${eventId}`);
    if (!response.ok()) {
        console.warn(`Failed to delete test event ${eventId}: ${await response.text()}`);
    }
}
