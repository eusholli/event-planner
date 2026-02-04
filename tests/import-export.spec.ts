import { test, expect } from '@playwright/test';
import { createTestEvent, deleteTestEvent } from './api/helpers';

test.describe('Import/Export API', () => {
    let sourceEventId: string;
    let targetEventId: string;
    const testEmail = `export-test-${Date.now()}@example.com`;

    test.beforeAll(async ({ request }) => {
        const event1 = await createTestEvent(request);
        sourceEventId = event1.id;
        const event2 = await createTestEvent(request);
        targetEventId = event2.id;
    });

    test.afterAll(async ({ request }) => {
        if (sourceEventId) await deleteTestEvent(request, sourceEventId);
        if (targetEventId) await deleteTestEvent(request, targetEventId);
    });

    test('should export event with attendees and import into another event', async ({ request }) => {
        // 1. Add Attendee to Source Event
        console.log(`Creating attendee in source event ${sourceEventId}`);
        const attRes = await request.post('/api/attendees', {
            multipart: {
                name: 'Export Candidate',
                email: testEmail,
                title: 'Export Specialist',
                company: 'Logistics Co',
                eventId: sourceEventId
            }
        });
        expect(attRes.ok()).toBeTruthy();
        const attendee = await attRes.json();
        const attendeeId = attendee.id;

        // 2. Export Source Event
        console.log(`Exporting source event ${sourceEventId}`);
        const exportRes = await request.get(`/api/events/${sourceEventId}/export`);
        expect(exportRes.ok()).toBeTruthy();
        const exportData = await exportRes.json();

        expect(exportData.attendees).toHaveLength(1);
        expect(exportData.attendees[0].email).toBe(testEmail);

        // 3. Modify Export Data for Target Import (simulating copy/restore)
        // The import logic uses ID upsert. So it will update the existing global attendee
        // and link it to the NEW event (targetEventId).
        // We don't need to change anything in the data structure, just send it to the new endpoint.
        // BUT `importEventData` checks for `data.event.id === eventId`.
        // If we want to import INTO targetEventId, we might need to adjust the ID in the payload
        // OR the import logic might reject it if IDs don't match?
        // Let's check `lib/actions/event.ts`:
        // if (data.event?.id && data.event.id !== eventId) throw Error...

        // So we MUST update the event ID in the payload to match the TARGET event ID 
        // if we are simulating a "merge" or "restore to new event".
        exportData.event.id = targetEventId;
        exportData.event.name = 'Target Event Updated';
        exportData.event.slug = `target-import-${Date.now()}`;

        // 4. Import into Target Event
        console.log(`Importing into target event ${targetEventId}`);
        const importRes = await request.post(`/api/events/${targetEventId}/import`, {
            data: exportData
        });

        if (!importRes.ok()) {
            const errorText = await importRes.text();
            console.error('Import Failed:', errorText);
            throw new Error(`Import API failed: ${importRes.status()} ${importRes.statusText()} - Body: ${errorText}`);
        }
        expect(importRes.ok()).toBeTruthy();

        // 5. Verify Target Event has the Attendee linked
        console.log(`Verifying target event attendees`);
        const listRes = await request.get(`/api/attendees?eventId=${targetEventId}`);
        expect(listRes.ok()).toBeTruthy();
        const attendees = await listRes.json();

        expect(attendees).toHaveLength(1);
        expect(attendees[0].id).toBe(attendeeId);
        expect(attendees[0].email).toBe(testEmail);
    });
});
