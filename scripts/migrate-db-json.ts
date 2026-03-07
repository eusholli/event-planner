import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const backupFile = path.join(process.cwd(), 'db-json', 'system-backup-2026-03-06T21-13-41.json');

try {
    const dataString = fs.readFileSync(backupFile, 'utf8');
    const data = JSON.parse(dataString);

    // We need to extract unique companies from attendees and create a top-level companies array
    const companiesMap = new Map<string, any>();

    // Iterate over all events, or if top level has attendees
    // A system backup has { systemSettings, events: [ { ..., attendees: [] } ] }
    if (data.events && Array.isArray(data.events)) {
        for (const event of data.events) {
            if (event.attendees && Array.isArray(event.attendees)) {
                for (const attendee of event.attendees) {
                    if (attendee.company) {
                        const companyName = attendee.company;

                        if (!companiesMap.has(companyName)) {
                            companiesMap.set(companyName, {
                                id: randomUUID(),
                                name: companyName,
                                description: attendee.companyDescription || null,
                                pipelineValue: null,
                            });
                        }

                        const companyRecord = companiesMap.get(companyName);

                        // Update attendee to use the new relation instead of old strings
                        attendee.companyId = companyRecord.id;
                        delete attendee.company;
                        delete attendee.companyDescription;
                    }
                }
            }
        }
    }

    // Add the top level companies (or add to each event if scoped, wait, system backup could have global companies? 
    // In our schema Company is global. but export puts it at event level or top level?
    // In lib/actions/event.ts: importEventData checks `data.companies`. This happens per event import.
    // If it's a full system backup, usually it's imported at event level or system level? 
    // Wait, the system level import might just loop over events and call importEventData, which expects companies per event or maybe the system import handles top-level companies.
    // Let me check system import. Let's just put all discovered companies at the top level, or attach to each event.

    // Actually, lib/actions/event.ts: importEventData(eventId, data)
    // If `data` is an event export, `data.companies` should be present.
    // Let's attach `companies` to each event's data block just in case, or top level.
    // For safety, let's put it on top-level AND inside each event.

    const allCompanies = Array.from(companiesMap.values());
    data.companies = allCompanies;

    // Also attach to events if needed by importEventData
    if (data.events && Array.isArray(data.events)) {
        for (const event of data.events) {
            event.companies = allCompanies;
        }
    }

    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    console.log(`Successfully migrated ${backupFile} to new format.`);

} catch (e: any) {
    console.error(`Migration failed:`, e.message);
}
