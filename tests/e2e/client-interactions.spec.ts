import { test, expect } from '@playwright/test';

test.describe('E2E Client Interactions', () => {

    test.describe('Settings Page', () => {
        test('should configure event settings', async ({ page }) => {
            await page.goto('/settings');

            const eventName = `E2E Event ${Date.now()}`;
            await page.getByLabel('Event Name').fill(eventName);

            // Set dates
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 7);

            // Format for date input: YYYY-MM-DD
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            await page.getByLabel('Start Date').fill(startStr);
            await page.getByLabel('End Date').fill(endStr);

            await page.getByLabel('Tags (comma separated)').fill('Urgent, Work, E2E');

            page.on('dialog', dialog => dialog.accept());
            await page.click('button:has-text("Save Configuration")');

            // Wait for reload or navigation if needed, or just reload manually to check persistence
            await page.reload();
            await expect(page.getByLabel('Event Name')).toHaveValue(eventName);
            // Tags are sorted alphabetically by the backend
            await expect(page.getByLabel('Tags (comma separated)')).toHaveValue('E2E, Urgent, Work');
        });
    });

    test.describe('Rooms Page', () => {
        test('should create, update, and delete a room', async ({ page }) => {
            await page.goto('/rooms');

            // Create
            const roomName = `E2E Room ${Date.now()}`;
            await page.getByLabel('Room Name').fill(roomName);
            await page.getByLabel('Capacity').fill('15');
            await page.getByRole('button', { name: 'Add Room' }).click();

            await expect(page.getByText(roomName)).toBeVisible();

            // Delete
            // We need to be careful to delete the specific room we created
            // Assuming the list shows the name, we can find the delete button relative to it
            const roomCard = page.locator('.card').filter({ hasText: roomName });
            page.on('dialog', dialog => dialog.accept());
            await roomCard.getByTitle('Delete').click();

            await expect(page.getByText(roomName)).not.toBeVisible();
        });
    });

    test.describe('Attendees Page', () => {
        test('should create, update, and delete an attendee', async ({ page }) => {
            await page.goto('/attendees');

            // Create
            const name = `E2E User ${Date.now()}`;
            const email = `e2e${Date.now()}@example.com`;

            await page.getByLabel('Name').fill(name);
            await page.getByLabel('Email').fill(email);
            await page.getByLabel('Company').fill('E2E Corp');
            await page.getByLabel('Title').fill('Tester');

            await page.getByRole('button', { name: 'Add' }).click();

            // Use getByRole heading to be specific and avoid strict mode violation
            await expect(page.getByRole('heading', { name: name })).toBeVisible();

            // Delete
            const attendeeCard = page.locator('.card').filter({ hasText: name });
            page.on('dialog', dialog => dialog.accept());
            await attendeeCard.getByTitle('Delete').click();

            await expect(page.getByRole('heading', { name: name })).not.toBeVisible();
        });
    });

    test.describe('New Meeting Page', () => {
        test.beforeEach(async ({ page }) => {
            // Ensure we have at least one room and attendee for testing
            await page.goto('/rooms');
            await page.getByLabel('Room Name').fill('Test Room');
            await page.getByLabel('Capacity').fill('10');
            await page.getByRole('button', { name: 'Add Room' }).click();

            await page.goto('/attendees');
            await page.getByLabel('Name').fill('Test Attendee');
            await page.getByLabel('Email').fill('test@example.com');
            await page.getByRole('button', { name: 'Add' }).click();
        });

        test('Scenario 1: Basic Meeting (STARTED)', async ({ page }) => {
            await page.goto('/new-meeting');

            const title = `Basic Meeting ${Date.now()}`;
            await page.getByLabel('Meeting Title').fill(title);

            // Status is STARTED by default
            await page.getByRole('button', { name: 'Book Meeting' }).click();

            await expect(page.getByText('Meeting started')).toBeVisible();
        });

        test('Scenario 2: Validation Check (COMPLETED)', async ({ page }) => {
            await page.goto('/new-meeting');

            await page.getByLabel('Meeting Title').fill('Invalid Meeting');
            await page.getByLabel('Status').selectOption('COMPLETED');

            await page.click('button:has-text("Book Meeting")');

            // Expect error messages
            await expect(page.getByText('Date and Start Time are required')).toBeVisible();
        });

        test('Scenario 3: Full Meeting (COMPLETED)', async ({ page }) => {
            await page.goto('/new-meeting');

            const title = `Full Meeting ${Date.now()}`;
            await page.getByLabel('Meeting Title').fill(title);
            await page.getByLabel('Status').selectOption('COMPLETED');

            // Fill required fields
            const date = new Date().toISOString().split('T')[0];
            await page.getByLabel('Date').fill(date);
            await page.getByLabel('Start Time').fill('15:00'); // 3 PM, after event start time
            await page.getByLabel('Duration').selectOption('60');

            // Select Room (assuming first option is the one we created or existing)
            await page.getByLabel('Select Room').selectOption({ index: 1 });

            // Select Attendee - the checkbox is inside a label that contains the attendee name
            await page.locator('label:has-text("Test Attendee")').locator('input[type="checkbox"]').check();

            await page.click('button:has-text("Book Meeting")');

            await expect(page.getByText('Meeting started')).toBeVisible();
        });

        test('Scenario 4: Date Validation', async ({ page }) => {
            // First set event dates to a specific range
            await page.goto('/settings');
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 1); // 1 day event

            await page.getByLabel('Start Date').fill(startDate.toISOString().split('T')[0]);
            await page.getByLabel('End Date').fill(endDate.toISOString().split('T')[0]);

            page.on('dialog', dialog => dialog.accept());
            await page.click('button:has-text("Save Configuration")');

            // Try to book outside range
            await page.goto('/new-meeting');
            await page.getByLabel('Meeting Title').fill('Outside Range');

            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 5);
            await page.getByLabel('Date').fill(futureDate.toISOString().split('T')[0]);
            await page.getByLabel('Start Time').fill('10:00');

            await page.click('button:has-text("Book Meeting")');

            await expect(page.getByText('Meeting must be within event dates')).toBeVisible();
        });

        test('Scenario 5: Optional Fields', async ({ page }) => {
            await page.goto('/new-meeting');

            const title = `Optional Fields ${Date.now()}`;
            await page.getByLabel('Meeting Title').fill(title);

            await page.getByLabel('Requester Email').fill('requester@example.com');
            await page.getByLabel('Meeting Type').selectOption('Other');
            await page.getByLabel('Purpose / Agenda').fill('Discussing optional fields');
            await page.getByLabel('Other Details').fill('Some extra details');

            // Tags (if available)
            const tagCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: 'Urgent' });
            if (await tagCheckbox.count() > 0) {
                await tagCheckbox.check();
            }

            await page.getByLabel('Approved').check();
            await page.getByLabel('Calendar Invite Sent').check();

            await page.click('button:has-text("Book Meeting")');

            await expect(page.getByText('Meeting started')).toBeVisible();
        });
    });
});
