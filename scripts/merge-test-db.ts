
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const TEST_DB_FILE = 'test-db.json';
const IMPORT_FILE = 'mwc-import-ready.json';

function main() {
    const dbPath = path.resolve(process.cwd(), TEST_DB_FILE);
    const importPath = path.resolve(process.cwd(), IMPORT_FILE);

    if (!fs.existsSync(dbPath)) {
        console.error(`DB file not found: ${dbPath}`);
        process.exit(1);
    }
    if (!fs.existsSync(importPath)) {
        console.error(`Import file not found: ${importPath}`);
        process.exit(1);
    }

    // Read files
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const importData = JSON.parse(fs.readFileSync(importPath, 'utf-8'));

    // Generate new Event ID
    const newEventId = randomUUID();
    console.log(`Generated new Event ID: ${newEventId}`);

    // Update Children with new Event ID
    const rooms = (importData.rooms || []).map((r: any) => ({ ...r, eventId: newEventId }));
    const attendees = (importData.attendees || []).map((a: any) => ({ ...a, eventId: newEventId }));
    const meetings = (importData.meetings || []).map((m: any) => ({ ...m, eventId: newEventId }));

    // Construct full event object
    const newEvent = {
        ...importData.event,
        id: newEventId,
        rooms: rooms,
        attendees: attendees,
        meetings: meetings
    };

    // Append to keys
    if (!dbData.events) {
        dbData.events = [];
    }
    dbData.events.push(newEvent);

    // Save
    fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));

    console.log(`Successfully added event "${newEvent.name}" to ${TEST_DB_FILE}`);
    console.log(`Total events in DB: ${dbData.events.length}`);
}

main();
