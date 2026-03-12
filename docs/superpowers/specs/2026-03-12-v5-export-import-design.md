# V5 Export/Import Format & MWC BCN 2026 Data Merge

**Date:** 2026-03-12
**Branch:** multi-event
**Status:** Approved

---

## Overview

Introduce a canonical, portable V5 export/import format for the multi-event system. Replace all UUID cross-references with human-readable name-based references so that backup files can be imported into any database instance. Add companies to the system export/import. Update both system-level and event-level export/import code. Generate `db-json/master-data-030926-v5.json` by merging the latest MWC BCN 2026 data from `mwc-final-031226.json` into the existing V4 dataset.

---

## Motivation

- The current system export omits companies entirely, making the file non-importable (attendees require `companyId`).
- The current system export retains UUID `eventId` on rooms/meetings but strips `id` from events — broken cross-references.
- The event export retains UUID `companyId`, `roomId`, and attendee IDs in meetings — tied to a specific DB instance.
- The system import uses `prisma.event.findFirst()` for all rooms/meetings/attendees, broken for multi-event systems.
- Meetings are only created on import, never updated — latest data is not applied on re-import.

---

## Canonical V5 Format

### System Export (`{ system, companies, events, attendees, rooms, meetings }`)

```json
{
  "system": {
    "geminiApiKey": "...",
    "defaultTags": [],
    "defaultMeetingTypes": [],
    "defaultAttendeeTypes": []
  },
  "companies": [
    { "name": "Rakuten Symphony", "description": "...", "pipelineValue": 0 }
  ],
  "events": [
    {
      "name": "MWC BCN 2026",
      "startDate": "2026-03-02T00:00:00.000Z",
      "endDate": "2026-03-05T00:00:00.000Z",
      "tags": [],
      "meetingTypes": [],
      "attendeeTypes": [],
      "timezone": "CET",
      "boothLocation": "...",
      "status": "OCCURRED",
      "slug": "mwc-bcn-2026",
      "roiTargets": {
        "expectedPipeline": 2000000,
        "targetCompanyNames": ["AT&T"]
      }
    }
  ],
  "attendees": [
    {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "companyName": "Rakuten Symphony",
      "title": "...",
      "bio": "",
      "linkedin": "",
      "imageUrl": "",
      "isExternal": false,
      "type": "Sales",
      "seniorityLevel": null
    }
  ],
  "rooms": [
    { "name": "Meeting Room 1 (Mickey)", "capacity": 10, "eventName": "MWC BCN 2026" }
  ],
  "meetings": [
    {
      "title": "MTG with Fujitsu",
      "eventName": "MWC BCN 2026",
      "room": "Meeting Room 1 (Mickey)",
      "attendees": ["jane@example.com"],
      "date": "2026-03-04",
      "startTime": "17:00",
      "endTime": "18:00",
      "status": "OCCURRED",
      "tags": [],
      "meetingType": "Sales/Customer"
    }
  ]
}
```

**Key rules:**
- No `id` fields on any entity.
- Attendees: `companyName` (string) instead of `companyId` (UUID).
- Rooms: `eventName` (string) instead of `eventId` (UUID).
- Meetings: `eventName` (string) instead of `eventId`; `room` name instead of `roomId`; `attendees` as email array instead of ID array.
- ROI targets: `targetCompanyNames` (string[]) instead of `targetCompanyIds`.
- Events: `authorizedUserIds` is resolved to `authorizedEmails` (string[]) via Clerk API on export; resolved back to `authorizedUserIds` via Clerk API on import.

### Event Export (`{ event, companies, attendees, rooms, meetings, roiTargets, intelligenceSubscriptions }`)

Same name-based rules, but scoped to a single event:
- No `eventName` on rooms/meetings (implicit from context).
- No `id`, `eventId`, `roomId`, or `companyId` in any record.
- Event: `authorizedUserIds` → `authorizedEmails` via Clerk API.
- Meeting `attendees` → email array.
- Meeting `room` → room name string.
- Intelligence subs: attendee IDs → emails; company IDs → names; event IDs → names.

---

## Changes Required

### 1. `app/api/settings/export/route.ts` (System Export)

- Fetch `companies` from DB; strip `id`; include in output.
- Build `companyIdToName` map; replace `companyId` with `companyName` on each attendee.
- Build `eventIdToName` map; replace `eventId` with `eventName` on each room.
- Meetings: replace `eventId` with `eventName`; strip `roomId` (room name already exported).
- Events ROI targets: replace `targetCompanyIds` with `targetCompanyNames`; the inline ROI stripping closure in the existing code is preserved and updated to also strip `id` and `eventId`.
- Strip `id` from all entity records.
- Events: for each event, call Clerk API (`clerkClient.users.getUser(userId)`) for each `authorizedUserId` to obtain the user's primary email address. Store as `authorizedEmails: string[]`. If any Clerk API call fails (network error, rate limit, etc.), **fail the entire export** with an error response.
- `slug` is included in the export but the import must handle slug collisions by appending a random suffix (same pattern used in event creation elsewhere in the codebase).

### 2. `app/api/settings/import/route.ts` (System Import)

Order of operations: system → companies → events → rooms → attendees → meetings → ROI targets.

- **System settings**: import `geminiApiKey`, `defaultTags`, `defaultMeetingTypes`, and `defaultAttendeeTypes` (currently only `geminiApiKey` is imported — the other three fields must be added).
- **Companies**: upsert by `name` (unique key); update `description` and `pipelineValue`.
- **Events**: upsert by `name`; handle slug collision by appending a random suffix if a different event already holds the slug. Resolve `authorizedEmails` → `authorizedUserIds`: for each email, call Clerk API (`clerkClient.users.getUserList({ emailAddress: [email] })`); if the user is not found on this Clerk instance, skip and add to warnings. Store the successfully resolved IDs as `authorizedUserIds`.
- **Rooms**: resolve `eventName` → eventId via in-memory map built from the events upsert step; upsert by `(name, eventId)` using `findFirst` then create/update (no DB unique constraint exists — see migration note below).
- **Attendees**: resolve `companyName` → companyId (create company if missing); upsert by `email`; connect to resolved eventId.
- **Meetings**: resolve `eventName` → eventId; resolve `room` name → roomId (from in-memory room map); resolve attendee emails → attendee IDs (from in-memory attendee map); **upsert by `(title, date, startTime, eventId)`** using `findFirst` then create/update; full field update on match.
- **ROI targets**: for each event that has `roiTargets` in the export, upsert the ROI record; resolve `targetCompanyNames` → companyIds via `resolveCompany` (or inline equivalent). This is a **net-new section** not present in the current `import/route.ts`.
- **Error handling**: best-effort with per-record `try/catch`; log and continue on individual record failures; return a summary `{ success: true, warnings: [...] }` listing any skipped records.

### 3. `lib/actions/event.ts` — `exportEventData`

- Companies: strip `id`; output `{ name, description, pipelineValue }`.
- Attendees: replace `companyId` with `company.name` (already loaded via include); strip `id`.
- Rooms: strip `id` and `eventId`.
- Meetings: replace attendee IDs with emails (build `attendeeIdToEmail` map from loaded attendees); replace `roomId` with room name (build `roomIdToName` map from loaded rooms); strip `id`, `eventId`, `roomId`.
- ROI targets: replace `targetCompanyIds` with `targetCompanyNames`; strip `id`, `eventId`.
- Intelligence subs: replace attendee IDs → emails; company IDs → names (fetch company names); event IDs → names.
- Event: call Clerk API for each `authorizedUserId` → primary email; store as `authorizedEmails`. **Fail the export** if any Clerk API call fails. The `authorizedEmails` field is always included (even if the list is empty).
- Update `version` to `'5.0'`.

### 4. `lib/actions/event.ts` — `importEventData`

The `id`-based upsert paths for rooms, attendees, and meetings are **removed and replaced**:

- **Scope check**: Replace `data.event?.id !== eventId` guard with a name-based warning: if `data.event?.name` does not match the target event's DB name, include a warning in the response but proceed.
- **Event `authorizedEmails`**: resolve each email → userId via Clerk API (`clerkClient.users.getUserList({ emailAddress: [email] })`); if user not found on this Clerk instance, skip and add to warnings; store successfully resolved IDs as `authorizedUserIds` on the event.
- **Companies**: replace `upsert({ where: { id: comp.id } })` with `upsert({ where: { name: comp.name } })`.
- **Rooms**: replace `upsert({ where: { id: room.id } })` with `findFirst({ where: { name, eventId } })` then create or update. Build an in-memory `roomNameToId` map after this step for meeting resolution.
- **Attendees**: replace `upsert({ where: { id: att.id } })` with `upsert({ where: { email: att.email } })`. Resolve `companyName` via existing `resolveCompany` helper. Build an in-memory `emailToAttendeeId` map after this step.
- **Meetings**: replace `upsert({ where: { id: mtg.id } })` with `findFirst({ where: { title, date, startTime, eventId } })` then create or update. Resolve `room` name → roomId via `roomNameToId` map. Resolve attendee emails → attendee IDs via `emailToAttendeeId` map.
- **ROI targets**: resolve `targetCompanyNames` → companyIds via `resolveCompany`.
- **Intelligence subs**: resolve attendee emails → IDs via `emailToAttendeeId` map; resolve company names → IDs via DB lookup; resolve event names → IDs via DB lookup.

### 5. `db-json/process_data.py` (V5 Generator)

Update the script to:
- Accept V4 master (`master-data-030926-v4.json`) and single-event source (`mwc-final-031226.json`).
- Output `master-data-030926-v5.json` in the canonical system export format.

The `mwc-final-031226.json` format uses email arrays for meeting attendees and room name strings for meeting rooms — it is already name-based, so no UUID resolution is needed from that source.

Merge steps (order matters):
  1. Build a `companyIdToName` map from V4 `companies`.
  2. Convert all V4 events to V5 format: strip `id`; keep `authorizedUserIds` as `authorizedEmails: []` (placeholder — V4 does not contain email mappings; the field is included as an empty array, preserving the schema but noting the data cannot be resolved offline without Clerk access).
  3. Update MWC BCN 2026 event metadata from mwc-final (tags, meetingTypes, attendeeTypes, timezone, boothLocation, dates).
  4. Replace MWC BCN 2026 rooms with rooms from mwc-final (strip any IDs).
  5. Replace MWC BCN 2026 meetings with meetings from mwc-final (already email + room-name based — pass through directly with `eventName` = "MWC BCN 2026").
  6. Convert V4 global attendees to V5 format: replace `companyId` with `companyName` via `companyIdToName`; strip `id`. For attendees in MWC BCN 2026, use mwc-final data as the source of truth (matched by email).
  7. Convert V4 companies to V5 format: strip `id`; output `{ name, description, pipelineValue }`.
  8. Build V5 system settings from V4 `systemSettings` (rename key, preserve all fields).
  9. Validate: no broken company name references in attendees, no duplicate emails, all meeting room names exist in MWC event rooms, all meeting attendee emails exist in attendees list.
  10. Write output with `exportedAt` timestamp and `version: '5.0'`.

---

## Data Flow Summary

```
V4 master (custom format)  +  mwc-final (single-event)
          │                           │
          └──────── process_data.py ──┘
                          │
                          ▼
           master-data-030926-v5.json
           (canonical system export format)
                          │
                          ▼
           /api/settings/import → DB
```

---

## Uniqueness Constraints (Import Keys)

| Entity    | Unique Key                    |
|-----------|-------------------------------|
| Company   | `name`                        |
| Event     | `name`                        |
| Room      | `(name, eventId)`             |
| Attendee  | `email`                       |
| Meeting   | `(title, date, startTime, eventId)` |

---

## Backwards Compatibility

- The existing `att.company` string fallback in `importEventData` is preserved.
- The `id`-based upsert paths in `importEventData` for rooms, attendees, and meetings are **replaced** — not extended. V4 ID-based upsert paths are removed. Any V4 event export files will need to be regenerated in V5 format before importing.
- The system import is rewritten for V5 format only (no UUID-based legacy support at system level).
- Both import routes should check for a `version` field and warn (but not block) if the version is not `'5.0'`, to surface accidental use of V4 files.

## Scope Validation (Event Import)

The current `importEventData` check `if (data.event?.id && data.event.id !== eventId)` becomes a no-op in V5 (no `id` on exported events). Replace with a name-based check: if `data.event?.name` is present and does not match the target event's name (fetched from DB), emit a warning in the response but do not block the import (the operator may intentionally be seeding an event from a template of another event).

---

## Schema Migration

A Prisma migration is required to add a unique constraint on `Room` to support reliable name-based upsert:

```prisma
@@unique([name, eventId])
```

Without this constraint, room upsert falls back to `findFirst` which is non-deterministic if duplicate room names exist within an event. The migration prevents duplicates going forward.

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `@@unique([name, eventId])` to `Room` model |
| `prisma/migrations/` | New migration for Room unique constraint |
| `app/api/settings/export/route.ts` | Add companies; name-based refs; `authorizedUserIds` → `authorizedEmails` via Clerk |
| `app/api/settings/import/route.ts` | Companies; name resolution; upsert meetings; ROI targets (new section); system settings full import; `authorizedEmails` → `authorizedUserIds` via Clerk |
| `lib/actions/event.ts` | `exportEventData`: name-based refs, strip IDs; `importEventData`: replace all ID-based upserts with name/email-based |
| `db-json/process_data.py` | Generate V5 system export format |
| `db-json/master-data-030926-v5.json` | New output file |
