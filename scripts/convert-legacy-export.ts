
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const INPUT_FILE = 'mwc-config-2026-01-17T16-27-34.json';
const OUTPUT_FILE = 'mwc-import-ready.json';

function main() {
    const inputPath = path.resolve(process.cwd(), INPUT_FILE);
    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        process.exit(1);
    }

    console.log(`Reading from ${INPUT_FILE}...`);
    const rawData = fs.readFileSync(inputPath, 'utf-8');
    const data = JSON.parse(rawData);

    // Mappings
    const attendeeEmailToId = new Map<string, string>();
    const roomNameToId = new Map<string, string>();

    // 1. Process Attendees
    const newAttendees = (data.attendees || []).map((att: any) => {
        const id = randomUUID();
        if (att.email) {
            attendeeEmailToId.set(att.email, id);
        }
        return {
            ...att,
            id: id,
            // Ensure proper types if needed, schema allows strings
        };
    });
    console.log(`Processed ${newAttendees.length} attendees.`);

    // 2. Process Rooms
    const newRooms = (data.rooms || []).map((room: any) => {
        const id = randomUUID();
        if (room.name) {
            roomNameToId.set(room.name, id);
        }
        return {
            ...room,
            id: id
        };
    });
    console.log(`Processed ${newRooms.length} rooms.`);

    // 3. Process Meetings
    const newMeetings = (data.meetings || []).map((mtg: any) => {
        const id = randomUUID();

        // Resolve Room ID
        let roomId = undefined;
        if (mtg.room) {
            roomId = roomNameToId.get(mtg.room);
            if (!roomId) {
                console.warn(`[Warning] Meeting "${mtg.title}" refers to unknown room "${mtg.room}"`);
            }
        }

        // Resolve Attendees
        const linkedAttendees: { id: string }[] = [];
        if (mtg.attendees && Array.isArray(mtg.attendees)) {
            mtg.attendees.forEach((email: string) => {
                const attId = attendeeEmailToId.get(email);
                if (attId) {
                    linkedAttendees.push({ id: attId });
                } else {
                    console.warn(`[Warning] Meeting "${mtg.title}" refers to unknown attendee email "${email}"`);
                    // Option: Create a placeholder attendee? No, safer to skip connection.
                }
            });
        }

        // Remove "room" (name) and replace with "roomId"
        // Remove "attendees" (emails) and replace with object structure
        const { room, attendees, ...rest } = mtg;

        return {
            ...rest,
            id: id,
            roomId: roomId,
            attendees: linkedAttendees
        };
    });
    console.log(`Processed ${newMeetings.length} meetings.`);

    // 4. Process Event
    // Remove "id" if present to avoid conflict, let import handle target event ID
    const { id, ...eventProps } = data.event || {};

    // Construct final JSON
    const outputData = {
        event: eventProps,
        attendees: newAttendees,
        rooms: newRooms,
        meetings: newMeetings,
        version: "converted-1.0",
        exportedAt: new Date().toISOString()
    };

    const outputPath = path.resolve(process.cwd(), OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\nSuccess! Converted data written to: ${OUTPUT_FILE}`);
}

main();
