
import prisma from '../lib/prisma';
import { exportEventData, importEventData } from '../lib/actions/event';

async function verifyImportExport() {
    console.log('Verifying Import/Export Functions...');

    // 1. Create a Test Event with Password and Authorized Users
    const testEventId = 'test-verify-' + Date.now();
    const testPassword = 'superSecretPassword123';
    const testAuthUsers = ['user_123', 'user_456'];

    try {
        const event = await prisma.event.create({
            data: {
                id: testEventId,
                name: 'Verify Event ' + Date.now(),
                slug: 'verify-event-' + Date.now(),
                status: 'DRAFT',
                password: testPassword,
                authorizedUserIds: testAuthUsers,
            },
        });

        console.log(`Created test event: ${event.id}`);

        // 2. Verify Event Export
        console.log('Testing Event Export...');
        const eventExport = await exportEventData(event.id);

        // Save data for import later
        const exportedData = eventExport;

        if (eventExport.event.password !== testPassword) {
            console.error('❌ Export FAILED: Password mismatch');
        } else {
            console.log('✅ Export: Password verified');
        }

        if (JSON.stringify(eventExport.event.authorizedUserIds) !== JSON.stringify(testAuthUsers)) {
            console.error('❌ Export FAILED: AuthorizedUserIds mismatch');
        } else {
            console.log('✅ Export: AuthorizedUserIds verified');
        }

        // 3. Delete the event to simulate checking import into fresh state 
        // (or we can just update the fields to null and see if they restore)
        console.log('Clearing fields to test restoration...');
        await prisma.event.update({
            where: { id: testEventId },
            data: {
                password: null,
                authorizedUserIds: []
            }
        });

        const clearedEvent = await prisma.event.findUnique({ where: { id: testEventId } });
        if (clearedEvent?.password !== null) throw new Error('Failed to clear password');
        console.log('Fields cleared.');

        // 4. Verify Event Import
        console.log('Testing Event Import...');
        // Mock the auth check inside importEventData? 
        // The previous script failed because of imports. 
        // importEventData calls `import('@/lib/roles')`. 
        // We might hit issues if we don't mock it or if the environment doesn't allow it.
        // However, since we are running with `tsx` and strict env vars might be missing, 
        // we should check if `canWrite` blocks us.
        // In `scripts/verify-db-export-import.ts`, they check for auth bypass.
        // We assume the local environment allows it or has the bypass set.
        // Alternatively, we can bypass the import function and test the prisma logic directly? 
        // No, we want to test the `importEventData` function itself.

        // Let's set the env var just in case
        process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH = 'true';

        await importEventData(testEventId, exportedData);

        const restoredEvent = await prisma.event.findUnique({ where: { id: testEventId } });

        if (restoredEvent?.password !== testPassword) {
            console.error('❌ Import FAILED: Password not restored');
            console.error(`Expected: ${testPassword}, Got: ${restoredEvent?.password}`);
        } else {
            console.log('✅ Import: Password restored successfully');
        }

        if (JSON.stringify(restoredEvent?.authorizedUserIds) !== JSON.stringify(testAuthUsers)) {
            console.error('❌ Import FAILED: AuthorizedUserIds not restored');
        } else {
            console.log('✅ Import: AuthorizedUserIds restored successfully');
        }

    } catch (e) {
        console.error('Test Execution Error:', e);
    } finally {
        // Cleanup
        await prisma.event.delete({ where: { id: testEventId } }).catch(() => { });
        await prisma.$disconnect();
    }
}

verifyImportExport();
