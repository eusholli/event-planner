
import { test, expect } from '@playwright/test';

test.describe('Vigorous Event Lifecycle Test', () => {

    test('should create, autocomplete (simulate), save, verify on dashboard, edit, and delete', async ({ page, request }) => {
        // 1. Create New Event via UI
        await page.goto('/events');
        await page.getByRole('button', { name: 'New Event' }).click();
        await expect(page).toHaveURL(/\/events\/.*\/settings/);

        // Extract ID from URL
        const url = page.url();
        const eventId = url.split('/events/')[1].split('/settings')[0];
        console.log(`Created Event ID: ${eventId}`);

        // 2. Simulate User Filling Name & AI Autocomplete
        // We can't easily rely on the REAL AI output in test (it's non-deterministic and costs money/latency).
        // instead, we will manually fill the fields to mismatched values first, then "Autocomplete" (simulate by filling fields)
        // OR better: We fill the fields exactly as the AI would, then Save.

        await page.getByLabel('Event Name').fill('Vigorous Test Event 2026');

        // Simulate "AI Autocomplete" by setting fields directly (mimicking the "handleAIFill" effect)
        // We do this by interacting with inputs to ensure "onChange" fires.
        await page.getByLabel('Start Date').fill('2026-05-19');
        await page.getByLabel('End Date').fill('2026-05-20');
        await page.getByLabel('Address / Location').fill('123 Test St, London, UK');
        await page.getByLabel('Target Budget ($)').fill('50000');
        await page.getByLabel('Region').selectOption('EU/UK');
        // If Budget is 0, we should test that too.

        // 3. Save
        await page.click('button:has-text("Save Changes")');
        // Wait for success message
        await expect(page.locator('text=Settings saved successfully')).toBeVisible();

        // 4. Verify on Dashboard (The specific user complaint)
        await page.goto('/events');
        await page.reload(); // Force reload to ensure no client cache

        // Find card
        const card = page.locator('.group').filter({ hasText: 'Vigorous Test Event 2026' });
        await expect(card).toBeVisible();

        // 5. Verify Data Persistence by Re-entering Settings
        await page.goto(`/events/${eventId}/settings`);

        await expect(page.getByLabel('Event Name')).toHaveValue('Vigorous Test Event 2026');
        await expect(page.getByLabel('Start Date')).toHaveValue('2026-05-19');
        await expect(page.getByLabel('End Date')).toHaveValue('2026-05-20');
        await expect(page.getByLabel('Address / Location')).toHaveValue('123 Test St, London, UK');
        await expect(page.getByLabel('Target Budget ($)')).toHaveValue('50000');
        await expect(page.getByLabel('Region')).toHaveValue('EU/UK');

        // 6. Edit Event
        await page.getByLabel('Event Name').fill('Vigorous Test Event EDITED');
        await page.getByLabel('Address / Location').fill('Edited Address');
        await page.click('button:has-text("Save Changes")');
        await expect(page.locator('text=Settings saved successfully')).toBeVisible();

        // 7. Verify Edit on Dashboard
        await page.goto('/events');
        await expect(page.locator('.group').filter({ hasText: 'Vigorous Test Event EDITED' })).toBeVisible();

        // 8. Delete Event
        // Navigate back to settings for delete? Or delete from dashboard?
        // User asked for "adding, saving and editing and saving and deleting".
        // Let's delete from settings if button exists, or dashboard.
        // Settings page has a delete button (handleDelete).
        await page.goto(`/events/${eventId}/settings`);

        page.on('dialog', dialog => dialog.accept());
        await page.click('button:has-text("Delete Event")'); // Assuming button text

        await expect(page).toHaveURL(/\/events$/);
        await expect(page.locator('.group').filter({ hasText: 'Vigorous Test Event EDITED' })).not.toBeVisible();
    });
});
