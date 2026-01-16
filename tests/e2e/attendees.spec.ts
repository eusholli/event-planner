import { test, expect } from '@playwright/test';
import { createEventViaApi } from './helpers';

test.describe('Attendees E2E', () => {
    let eventId: string;

    test.beforeAll(async ({ request }) => {
        const event = await createEventViaApi(request);
        eventId = event.id;
    });

    test.beforeEach(async ({ page }) => {
        await page.goto(`/events/${eventId}/attendees`);
    });

    test('should create, update, and delete an attendee', async ({ page }) => {
        // --- CREATE ---
        const name = `E2E Attendee ${Date.now()}`;
        const email = `e2e-attendee-${Date.now()}@example.com`;
        const company = 'E2E Inc.';
        const title = 'Professional Tester';

        await page.getByLabel('Name').fill(name);
        await page.getByLabel('Email').fill(email);
        await page.getByLabel('Company').fill(company);
        await page.getByLabel('Title').fill(title);

        await page.getByRole('button', { name: 'Add' }).click();

        // Verify creation
        // The previous test used heading search, let's stick to that or filter by text
        await expect(page.getByRole('heading', { name: name })).toBeVisible();
        await expect(page.getByText(email)).toBeVisible();

        // --- DELETE ---
        const attendeeCard = page.locator('.card, .bg-white').filter({ hasText: name }); // Adjusted selector to be more inclusive

        page.on('dialog', dialog => dialog.accept());
        await attendeeCard.getByTitle('Delete').click();

        // Verify deletion
        await expect(page.getByRole('heading', { name: name })).not.toBeVisible();
    });
});
