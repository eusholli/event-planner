# Data Processing Design: Master Export Cleanup & Enrichment

**Date:** 2026-03-08
**Branch:** multi-event

## Overview

A Python script (`db-json/process-data.py`) that transforms `master-data-030826.json` into a clean, enriched version (`master-data-030826-v2.json`) ready for import into the multi-event tool. The script performs four operations in sequence: prune old events, replace MWC BCN 2026 data, clean up orphans, and enrich descriptions via Tavily.

## Files

| File | Purpose |
|------|---------|
| `db-json/process-data.py` | Main processing script |
| `db-json/master-data-030826.json` | Input: multi-event v5.0-simplified-roi export |
| `db-json/mwc-030826.json` | Input: single-event MWC export (authoritative source) |
| `db-json/master-data-030826-v2.json` | Output: cleaned and enriched export |
| `db-json/.enrichment-cache.json` | Tavily response cache (resume-safe, gitignored) |

**Dependencies:** `requests`, `uuid` (stdlib). `TAVILY_API_KEY` from environment.

## Step 1: Prune Old Events

Remove events where `startDate < 2026-02-28T00:00:00.000Z`.

**Events deleted (9):**
- PTC '26 (Jan 18), Canto Connect (Feb 1), IoT Tech Expo Global (Feb 4), Cisco Live Amsterdam (Feb 9), Capacity Middle East (Feb 9), ITEXPO / 6G Expo (Feb 10), Metro Connect USA (Feb 22), RTIME 2026 (Feb 22), NATE UNITE 2026 (Feb 23)

**Cascade cleanup:**
1. Collect `attendeeIds` from all deleted events
2. Remove attendees whose ID appears in no remaining event's `attendeeIds`
3. Remove companies with no remaining attendees referencing them

## Step 2: Replace MWC BCN 2026 Data

Source: `mwc-030826.json` (single-event format). Full replacement of MWC-scoped data.

**Event metadata:** Preserve `id`, `slug`, `authorizedUserIds`, `roiTargets`, `timezone`, `boothLocation`, `url`, `address`. Update `tags`, `meetingTypes`, `attendeeTypes`, `description`, dates from new file.

**Rooms:** Replace entirely. Generate new UUIDs. Map old room names to new UUIDs for meeting references.

**Meetings:** Replace all 321 meetings from new file. Generate new UUIDs. Resolve `roomId` by matching room name. Set `eventId` to MWC's existing UUID.

**Attendees (274 from new file):**
1. Match by `email` against global attendee pool
2. Found → update `name`, `title`, `bio`, `linkedin`, `imageUrl`, `isExternal`, `type`
3. Not found → create with new UUID; look up or create company by name
4. Rebuild MWC `attendeeIds` from processed set

**Orphan cleanup:** Attendees previously linked to MWC but absent from new file → remove if not linked to any other remaining event. Cascade to companies.

## Step 3: Tavily Enrichment

Cache key format: `event:{id}`, `company:{id}`, `attendee:{id}`. Cached entries are skipped on re-run. 1-second delay between calls.

| Entity | Field | Query | Condition |
|--------|-------|-------|-----------|
| Events | `description` | `"{name}" conference {year} overview agenda` | All events |
| Companies | `description` | `"{name}" company telecom technology overview` | All companies |
| Attendees | `bio` | `"{name}" "{company}" "{title}"` | `isExternal=true` and non-empty `title` only; skip if result < 100 chars |

**Settings:** `search_depth="advanced"`, `max_results=3`. Use first 300 chars of most relevant snippet.

**Estimated volume:** ~57 events + ~73 companies + ~150-200 attendees ≈ 330 Tavily calls total.

## Step 4: Output & Validation

**Output structure** (v5.0-simplified-roi, valid for system import):
```json
{
  "version": "5.0-simplified-roi",
  "exportedAt": "<timestamp>",
  "systemSettings": { ... },
  "companies": [ ... ],
  "attendees": [ ... ],
  "events": [ ... ]
}
```

**Validation before write:**
- All `attendeeIds` in events resolve to valid UUIDs in global pool
- All `companyId` on attendees resolve to valid company UUIDs
- All `roomId` in meetings resolve to valid rooms within same event
- No duplicate emails in attendee pool
- MWC event present with status `OCCURRED`

**Console output:** counts of deletions, MWC merge stats, enrichment progress (X/Y, cached vs fresh), validation results, final file path.
