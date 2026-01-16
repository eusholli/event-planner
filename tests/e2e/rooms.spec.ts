import { test, expect } from '@playwright/test';
import { createEventViaApi } from './helpers';

test.describe('Rooms E2E', () => {
    let eventId: string;

    test.beforeAll(async ({ request }) => {
        const event = await createEventViaApi(request);
        eventId = event.id;
    });

    test.beforeEach(async ({ page }) => {
        await page.goto(`/events/${eventId}/rooms`);
    });

    test('should create, update, and delete a room', async ({ page }) => {
        // --- CREATE ---
        const roomName = `E2E Room ${Date.now()}`;
        const initialCapacity = '10';

        await page.getByLabel('Room Name').fill(roomName);
        await page.getByLabel('Capacity').fill(initialCapacity);
        await page.getByRole('button', { name: 'Add Room' }).click();

        // Verify creation
        const roomCard = page.locator('.card, .bg-white').filter({ hasText: roomName });
        await expect(roomCard).toBeVisible();
        await expect(roomCard).toContainText(`Capacity: ${initialCapacity}`);

        // --- DELETE ---
        page.on('dialog', dialog => dialog.accept());
        await roomCard.getByTitle('Delete').click();

        // Verify deletion
        await expect(page.getByText(roomName)).not.toBeVisible();
    });
});
