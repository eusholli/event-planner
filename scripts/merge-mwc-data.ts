import * as fs from 'fs';
import * as path from 'path';

const CENTRAL_PATH = path.resolve(process.cwd(), 'db-json/central-attendee-export.json');
const MWC_PATH = path.resolve(process.cwd(), 'db-json/mwc-old-system.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'db-json/merged-system-export.json');

// Helper to generate IDs if missing (simple random for script purposes, or retain if present)
const generateId = () => 'cml-merge-' + Math.random().toString(36).substr(2, 9);

async function mergeData() {
    console.log('Reading files...');
    const centralData = JSON.parse(fs.readFileSync(CENTRAL_PATH, 'utf-8'));
    const mwcData = JSON.parse(fs.readFileSync(MWC_PATH, 'utf-8'));

    // 1. Identify Target Event in Central
    // Match by slug "mwc-barcelona" (verified in central) or name
    let targetEventIndex = centralData.events.findIndex((e: any) =>
        e.slug === 'mwc-barcelona' || e.slug === 'mwc-bcn-2026' || e.name.includes('MWC Barcelona')
    );

    if (targetEventIndex === -1) {
        throw new Error('Could not find MWC Barcelona event in central export.');
    }

    const targetEvent = centralData.events[targetEventIndex];
    console.log(`Found target event: ${targetEvent.name} (${targetEvent.id})`);

    // 2. Process Global Attendees
    console.log('Merging Attendees...');
    const centralAttendeesMap = new Map();
    centralData.attendees.forEach((a: any) => centralAttendeesMap.set(a.email.toLowerCase(), a));

    const mwcAttendeeIds: string[] = [];

    // Valid MWC Attendees List
    const mwcAttendees = mwcData.attendees || [];

    for (const att of mwcAttendees) {
        if (!att.email) continue;
        const email = att.email.toLowerCase();

        let existing = centralAttendeesMap.get(email);
        let attendeeId;

        const newAttendeeData = {
            ...att,
            id: existing ? existing.id : (att.id || generateId()), // Keep existing ID or use MWC/new
            events: undefined // Clean up
        };

        if (existing) {
            // Update existing global attendee with MWC data if needed (assuming MWC is richer)
            // For now, let's just merge fields, preferring MWC for non-nulls
            Object.assign(existing, newAttendeeData);
            attendeeId = existing.id;
        } else {
            // New Attendee
            centralData.attendees.push(newAttendeeData);
            centralAttendeesMap.set(email, newAttendeeData);
            attendeeId = newAttendeeData.id;
        }

        mwcAttendeeIds.push(attendeeId);
    }

    // Update Event Attendee Linkage
    // Merge with existing IDs (if any) and deduplicate
    const combinedIds = new Set([...(targetEvent.attendeeIds || []), ...mwcAttendeeIds]);
    targetEvent.attendeeIds = Array.from(combinedIds);
    console.log(`Updated Event Attendees: ${targetEvent.attendeeIds.length} total.`);

    // 3. Process Rooms
    console.log('Merging Rooms...');
    /*
        MWC Rooms format in array (from grep): "rooms": [ ... ]
        Central Rooms format: { id, name, capacity, eventId }
    */
    const eventRooms = targetEvent.rooms || [];
    const roomNameToId = new Map();

    // Index existing rooms
    eventRooms.forEach((r: any) => roomNameToId.set(r.name.toLowerCase(), r.id));

    // Process MWC Rooms
    const mwcRooms = mwcData.rooms || [];
    for (const r of mwcRooms) {
        const nameKey = r.name.toLowerCase();
        let rId = roomNameToId.get(nameKey);

        if (!rId) {
            rId = r.id || generateId();
            eventRooms.push({
                id: rId,
                name: r.name,
                capacity: r.capacity || 10, // Default if missing
                eventId: targetEvent.id
            });
            roomNameToId.set(nameKey, rId);
        }
    }
    targetEvent.rooms = eventRooms;

    // 4. Process Meetings
    console.log('Merging Meetings...');
    const mwcMeetings = mwcData.meetings || [];

    // Normalize MWC meetings
    const normalizedMeetings = mwcMeetings.map((m: any) => {
        // Map Attendees Emails -> IDs
        const meetingAttendeeIds = (m.attendees || []).map((emailOrString: string) => {
            // It might be an email or an ID? Sample showed emails.
            // Check map
            const att = centralAttendeesMap.get(emailOrString.toLowerCase());
            if (att) return att.id;

            // If email not found in registry (maybe external without profile?), create placeholder?
            // For this script, we'll warn and verify.
            // Actually, if it's an email, we should have processed it in Step 2 IF it was in attendees list.
            // If it's NOT in attendees list, we need to create a "ghost" attendee or skip.
            // Let's create a minimal attendee to be safe.
            const newId = generateId();
            const newAtt = {
                id: newId,
                email: emailOrString,
                name: emailOrString.split('@')[0],
                type: 'External' // Assumption
            };
            centralData.attendees.push(newAtt);
            centralAttendeesMap.set(emailOrString.toLowerCase(), newAtt);
            targetEvent.attendeeIds.push(newId); // Ensure linked to event
            return newId;
        });

        // Map Room Name -> ID
        let roomId = null;
        if (m.room) {
            // Room might be a name string
            const rId = roomNameToId.get(m.room.toLowerCase());
            if (rId) roomId = rId;
            else {
                // Create room on fly if needed
                const newRId = generateId();
                targetEvent.rooms.push({
                    id: newRId,
                    name: m.room,
                    capacity: 10,
                    eventId: targetEvent.id
                });
                roomNameToId.set(m.room.toLowerCase(), newRId);
                roomId = newRId;
            }
        }

        return {
            ...m,
            id: m.id || generateId(),
            eventId: targetEvent.id,
            attendees: meetingAttendeeIds,
            room: undefined, // Remove legacy room string/obj
            roomId: roomId
        };
    });

    targetEvent.meetings = normalizedMeetings;

    // 5. Update Event Meta (Optional, if MWC export is newer/better)
    // targetEvent.description = mwcData.event.description || targetEvent.description;
    // targetEvent.boothLocation = mwcData.event.boothLocation || targetEvent.boothLocation;

    // 6. Write Output
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(centralData, null, 2));
    console.log(`Success! Merged file written to ${OUTPUT_PATH}`);
}

mergeData().catch(e => {
    console.error(e);
    process.exit(1);
});
