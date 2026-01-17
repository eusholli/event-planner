
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const OUTPUT_FILE = path.join(process.cwd(), 'test-db.json');

// 1. System Defaults
const systemSettings = {
    geminiApiKey: "AIzaSyD3l8j-JEukPjNFhVZcV2HlWMLpMn2o734",
    defaultAttendeeTypes: ["BU IS", "BU OSS", "BU RAN", "Customer", "Customer Success", "Marketing", "Partner", "Press / Analyst", "Sales", "Staff", "Vendor"],
    defaultMeetingTypes: ["Channel Partner", "Govt", "Other", "PR Engagement", "Sales/Customer", "Technology Partner", "Vendor Partner", "BU Cloud"],
    defaultTags: ["APAC", "Americas", "Europe", "Global", "IS", "Japan Enterprise", "LATAM", "MEA", "OSS", "Open RAN MoU", "Partner", "RAN", "RMI"]
};

// Helper to generate IDs
const newId = () => uuidv4();
const now = new Date();
const futureStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
const futureEnd = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
const pastStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
const pastEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

// 2. Events Data
const events = [
    // 1. PIPELINE (Draft)
    {
        id: newId(),
        name: "Future Innovation Summit (Draft)",
        status: "PIPELINE",
        tags: ["Global", "Technology"],
        meetingTypes: ["Sales/Customer"],
        attendeeTypes: ["Staff"],
        // Minimal data
        startDate: null,
        endDate: null,
        address: null,
        rooms: [],
        attendees: [],
        meetings: []
    },
    // 2. COMMITTED
    {
        id: newId(),
        name: "Annual Partner Conference 2026",
        status: "COMMITTED",
        startDate: futureStart,
        endDate: futureEnd,
        address: "123 Convention Center Dr, San Francisco, CA",
        region: "NA",
        tags: ["Partner", "Americas"],
        meetingTypes: ["Channel Partner", "Technology Partner"],
        attendeeTypes: ["Partner", "Staff"],
        rooms: [
            { id: newId(), name: "Main Hall", capacity: 500 },
            { id: newId(), name: "Breakout Room A", capacity: 50 },
            { id: newId(), name: "Breakout Room B", capacity: 50 }
        ],
        attendees: [
            { id: newId(), name: "John Doe", email: "john@example.com", title: "VP Sales", company: "TechCorp", isExternal: true, type: "Partner" },
            { id: newId(), name: "Jane Smith", email: "jane@internal.com", title: "Event Manager", company: "OurCompany", isExternal: false, type: "Staff" }
        ],
        // Meetings will be linked after ID generation
        meetings: []
    },
    // 3. OCCURRED
    {
        id: newId(),
        name: "Q1 Global Strategy Review",
        status: "OCCURRED",
        startDate: pastStart,
        endDate: pastEnd,
        address: "Corporate HQ, New York, NY",
        region: "NA",
        tags: ["Global", "IS"],
        meetingTypes: ["Internal"],
        attendeeTypes: ["Staff", "BU IS"],
        rooms: [
            { id: newId(), name: "Boardroom", capacity: 20 }
        ],
        attendees: [
            { id: newId(), name: "Alice Director", email: "alice@internal.com", title: "Director", company: "OurCompany", isExternal: false, type: "Staff" }
        ],
        meetings: []
    },
    // 4. CANCELED
    {
        id: newId(),
        name: "Cancelled Product Launch",
        status: "CANCELED",
        startDate: futureStart,
        endDate: futureEnd, // Kept dates even if cancelled
        address: "TBD",
        tags: ["Marketing"],
        meetingTypes: ["PR Engagement"],
        attendeeTypes: ["Press / Analyst"],
        rooms: [],
        attendees: [],
        meetings: []
    }
];

// Wiring up relationships for Committed and Occurred events
// COMMITTED Event
const committedEvent = events[1];
const committedRoom = committedEvent.rooms[0];
const committedAttendee = committedEvent.attendees[0];

committedEvent.meetings.push({
    id: newId(),
    title: "Keynote Address",
    startTime: futureStart,
    endTime: new Date(new Date(futureStart).getTime() + 60 * 60 * 1000).toISOString(),
    roomId: committedRoom.id,
    room: committedRoom, // Export format includes the full object sometimes or just ID? Let's check export logic.
    // Export route: meetings: { include: { attendees: true, room: true } }
    // So yes, full objects.
    status: "CONFIRMED",
    attendees: [committedAttendee], // M2M
    eventId: committedEvent.id
});

// OCCURRED Event
const occurredEvent = events[2];
const occurredRoom = occurredEvent.rooms[0];
const occurredAttendee = occurredEvent.attendees[0];

occurredEvent.meetings.push({
    id: newId(),
    title: "Strategy Session",
    startTime: pastStart,
    endTime: new Date(new Date(pastStart).getTime() + 2 * 60 * 60 * 1000).toISOString(),
    roomId: occurredRoom.id,
    room: occurredRoom,
    status: "OCCURRED",
    attendees: [occurredAttendee],
    eventId: occurredEvent.id
});


// Construct Final JSON
const exportData = {
    systemSettings: systemSettings,
    events: events,
    exportedAt: new Date().toISOString(),
    version: '2.0-full-system'
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exportData, null, 2));
console.log(`Generated ${OUTPUT_FILE}`);
