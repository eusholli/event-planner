import { test, expect } from '@playwright/test';
import { createEventViaApi } from './helpers';

test.describe('Events E2E', () => {

    test('should create and configure a new event via UI', async ({ page }) => {
        await page.goto('/events');

        // Click New Event (using accessible role)
        await page.getByRole('button', { name: 'New Event' }).click();

        // Should redirect to /events/[id]/settings
        await expect(page).toHaveURL(/\/events\/.*\/settings/);

        // Configure
        const eventName = `UI Created Event ${Date.now()}`;
        await page.getByLabel('Event Name').fill(eventName);

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        await page.getByLabel('Start Date').fill(startDate.toISOString().split('T')[0]);
        await page.getByLabel('End Date').fill(endDate.toISOString().split('T')[0]);

        await page.click('button:has-text("Save Changes")');

        await page.reload();
        await expect(page.getByLabel('Event Name')).toHaveValue(eventName);
    });

    test('should update existing event settings', async ({ page, request }) => {
        const { id: eventId } = await createEventViaApi(request);

        await page.goto(`/events/${eventId}/settings`);

        const updatedName = `Updated Name ${Date.now()}`;
        await page.getByLabel('Event Name').fill(updatedName);
        await page.click('button:has-text("Save Changes")');

        await page.reload();
        await expect(page.getByLabel('Event Name')).toHaveValue(updatedName);
    });

    test('should delete an event from dashboard/list', async ({ page, request }) => {
        const { id: eventId, name: eventName } = await createEventViaApi(request);

        await page.goto('/events');

        // Filter card by name
        // We look for a card containing the text. 
        // The card has an onClick handler, so we can't easily scope to it.
        // But each card has a delete button with title "Delete".
        // We can find the container that text 'eventName' and inside it find button with title "Delete".

        const card = page.locator('.group').filter({ hasText: eventName });
        await expect(card).toBeVisible();

        page.on('dialog', dialog => dialog.accept());
        await card.getByTitle('Delete').click();

        await expect(card).not.toBeVisible();
    });
    test('should show blank dates for new event', async ({ page }) => {
        await page.goto('/events');
        await page.getByRole('button', { name: 'New Event' }).click();
        await expect(page).toHaveURL(/\/events\/.*\/settings/);

        const startDate = page.getByLabel('Start Date');
        const endDate = page.getByLabel('End Date');

        await expect(startDate).toBeEmpty();
        await expect(endDate).toBeEmpty();

        // Verify we can save
        const today = new Date().toISOString().split('T')[0];
        await startDate.fill(today);
        await endDate.fill(today);

        await page.getByRole('button', { name: 'Save Changes' }).click();

        // Should rely on reload or toast? 
        // existing test reloads.
        await page.reload();
        await expect(page.getByLabel('Start Date')).toHaveValue(today);
    });
});
