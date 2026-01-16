import { test, expect } from '@playwright/test';
import { createEventViaApi, createRoomViaApi, createAttendeeViaApi } from './helpers';

test.describe('Meetings E2E', () => {
    let eventId: string;
    let roomName: string; // We'll get this from API creation result if returned, or we need to pass it?
    // createRoomViaApi returns ID. The Name is hardcoded "Helper Room ...". 
    // We should probably return Name from createRoomViaApi too?
    // Or just create it with a known name by passing it?
    // Let's assume Room/Attendee API creation returns ID, but we need Name for UI selection.
    // I need to update helpers again if I want Names. Or I can assume "Helper Room" prefix check if unique enough.
    // Wait, createRoomViaApi returns ID.
    // Let's update helpers to return names for Rooms/Attendees too. That's safer.
    // I'll skip that update for brevity and just fetch the room/attendee via UI or just trust the helper logic if I update it.
    // Actually, I'll update the helper first in next step if needed. 
    // But for now, let's assume I can change the helper logic in `meetings.spec.ts`? No.
    // Let's just update `meetings.spec.ts` assuming the helpers *will* be updated or use valid assumptions.
    // "Helper Room {Date.now()}" -> finding this might be hard if we don't know the timestamp.
    // So I MUST update helpers to return names.

    // I will pause `meetings.spec.ts` refactoring until I update helpers.
    // But I can't do that easily now as I'm in tool chain.
    // I'll update `meetings.spec.ts` to just create Room/Attendee via UI in `beforeEach` inside the test context if API names are missing.
    // Actually, UI creation is slower but safer given current helper state.
    // OR create them via API and simply assume I can find them? No.

    // Better: Update `helpers.ts` to accept `name` as param.
    // Then I can pass known name.

    // I will update `helpers.ts` in proper order.
    // But I already replaced `helpers.ts` content.
    // I'll update `meetings.spec.ts` to manage its own room/attendee creation via UI for now to be safe, or API if I can pass name.
    // But `helpers.ts` is shared.

    // Let's stick to UI creation for Room/Attendee in `meetings.spec.ts`. It's robust.

    test.beforeAll(async ({ request }) => {
        const event = await createEventViaApi(request);
        eventId = event.id;
    });

    test.beforeEach(async ({ page, request }) => {
        // Setup dependencies via API for speed/reliability
        const { id: rId, name: rName } = await createRoomViaApi(request, eventId);
        const { id: aId, name: aName } = await createAttendeeViaApi(request, eventId);

        // Store for test use
        roomName = rName;
        process.env.TEST_ROOM_NAME = rName;
        process.env.TEST_ATTENDEE_NAME = aName;

        // We verify page is ready
        await page.goto(`/events/${eventId}/new-meeting`);
    });

    test('should book a meeting successfully', async ({ page }) => {
        await page.goto(`/events/${eventId}/new-meeting`);

        const title = `E2E Meeting ${Date.now()}`;
        await page.getByLabel('Meeting Title').fill(title);
        await page.getByLabel('Status').selectOption('CONFIRMED');

        const date = new Date().toISOString().split('T')[0];
        await page.getByLabel('Date').fill(date);
        await page.getByLabel('Start Time').fill('14:00');
        await page.getByLabel('Duration').selectOption('60');

        // Select Room
        const rName = process.env.TEST_ROOM_NAME;
        await page.getByLabel('Select Room').selectOption({ label: `${rName} (5)` });

        // Select Attendee
        const aName = process.env.TEST_ATTENDEE_NAME;
        await page.locator('label').filter({ hasText: aName }).getByRole('checkbox').check();

        await page.click('button:has-text("Start Meeting")');

        await expect(page.getByText('Meeting started')).toBeVisible({ timeout: 10000 }).catch(() =>
            expect(page.getByText('Meeting booked')).toBeVisible()
        );
    });

    test('should validate double booking', async ({ page }) => {
        // Setup initial booking
        await page.goto(`/events/${eventId}/new-meeting`);
        await page.getByLabel('Meeting Title').fill('First Meeting');
        const date = new Date().toISOString().split('T')[0];
        await page.getByLabel('Date').fill(date);
        await page.getByLabel('Start Time').fill('10:00');
        await page.getByLabel('Duration').selectOption('60');
        // Select Room (Find by label text which is often "RoomName (Capacity)")
        // We might need to iterate or hope it's in the list. 
        // Playwright's selectOption can take a label.
        // If the backend adds capacity, we need to match that.
        // Generally usually selects by value, but playwright allows label or value.
        // Let's try to match the text we just created.
        await page.getByLabel('Select Room').selectOption({ index: 1 });
        await page.click('button:has-text("Start Meeting")');
        await page.waitForTimeout(500);

        // Try booking same time
        await page.goto(`/events/${eventId}/new-meeting`);
        await page.getByLabel('Meeting Title').fill('Conflict');
        await page.getByLabel('Date').fill(date);
        await page.getByLabel('Start Time').fill('10:00');
        await page.getByLabel('Duration').selectOption('60');
        await page.getByLabel('Select Room').selectOption({ index: 1 });

        await page.click('button:has-text("Start Meeting")');

        await expect(page.getByText('Room is already booked')).toBeVisible();
    });

    test('should validate booking outside event dates', async ({ page }) => {
        // Event Setup (Name/Date) is needed?
        // Logic relies on Event Start/End.
        // We need to set them.
        await page.goto(`/events/${eventId}/settings`);
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 1);
        await page.getByLabel('Start Date').fill(startDate.toISOString().split('T')[0]);
        await page.getByLabel('End Date').fill(endDate.toISOString().split('T')[0]);
        await page.click('button:has-text("Save Configuration")');

        // Try booking future
        await page.goto(`/events/${eventId}/new-meeting`);
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 5);
        await page.getByLabel('Date').fill(futureDate.toISOString().split('T')[0]);

        // Fill other required
        await page.getByLabel('Meeting Title').fill('Outside Range');
        await page.getByLabel('Start Time').fill('10:00');
        await page.getByLabel('Duration').selectOption('60');
        const rName = process.env.TEST_ROOM_NAME;
        await page.getByLabel('Select Room').selectOption({ index: 1 });

        await page.click('button:has-text("Start Meeting")');

        await expect(page.getByText('Meeting must be within event dates')).toBeVisible();
    });
});
