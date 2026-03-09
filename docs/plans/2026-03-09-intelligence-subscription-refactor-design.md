# Intelligence Subscription Refactor — Design

**Date:** 2026-03-09
**Status:** Approved
**Branch:** multi-event

---

## Overview

Refactor the intelligence subscription system from a passive meeting-based matching model to an explicit, user-driven selection model. Users choose exactly which attendees, companies, and events they want to track. Subscription counts on those entities drive what OpenClaw researches. Root/marketing users automatically receive an aggregate report of all updated intelligence on every run.

---

## Architecture

```
[User selects entities on /intelligence/subscribe]
        │
        ├─ POST /api/intelligence/subscribe/attendees|companies|events
        │     └─ Creates junction row + increments subscriptionCount
        │
[OpenClaw Cron - Tue/Thu 6AM]
        │
        ├─ GET /api/intelligence/targets
        │     └─ Returns all entities where subscriptionCount > 0
        │           (companies, attendees, events)
        │
        ├─ Research each target + all entities linked to subscribed events
        │
        └─ POST /api/webhooks/intel-report
                │
        [NextJS Webhook Handler]
                │
                ├─ Store in IntelligenceReport table
                │
                ├─ For each active subscriber:
                │     ├─ Load selectedAttendeeIds, selectedCompanyIds, selectedEventIds
                │     ├─ Match updatedTargets against direct selections
                │     ├─ Match updatedTargets against entities in subscribed events
                │     ├─ Mark highlighted if also directly selected
                │     ├─ If no matches → skip
                │     └─ Compose personalised email via Gemini → send
                │
                └─ For each root/marketing user (via Clerk SDK):
                      └─ Compose aggregate report of ALL updated targets → send
```

---

## Data Model

### Add `subscriptionCount` to existing models

```prisma
model Attendee {
  // ...existing fields...
  subscriptionCount Int @default(0)
}

model Company {
  // ...existing fields...
  subscriptionCount Int @default(0)
}

model Event {
  // ...existing fields...
  subscriptionCount Int @default(0)
}
```

### Modify `IntelligenceSubscription`

```prisma
model IntelligenceSubscription {
  id               String   @id @default(cuid())
  userId           String   @unique
  email            String
  active           Boolean  @default(true)
  unsubscribeToken String   @unique @default(cuid())
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  selectedAttendees IntelligenceSubAttendee[]
  selectedCompanies IntelligenceSubCompany[]
  selectedEvents    IntelligenceSubEvent[]
}
```

### New junction tables

```prisma
model IntelligenceSubAttendee {
  subscriptionId String
  attendeeId     String
  subscription   IntelligenceSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  attendee       Attendee                 @relation(fields: [attendeeId], references: [id], onDelete: Cascade)
  @@id([subscriptionId, attendeeId])
}

model IntelligenceSubCompany {
  subscriptionId String
  companyId      String
  subscription   IntelligenceSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  company        Company                  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@id([subscriptionId, companyId])
}

model IntelligenceSubEvent {
  subscriptionId String
  eventId        String
  subscription   IntelligenceSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  event          Event                    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@id([subscriptionId, eventId])
}
```

**Cascade behaviour:** Deleting an attendee/company/event automatically removes its junction rows. The API must decrement `subscriptionCount` before deleting an entity (no DB-level trigger in Prisma).

---

## API Layer

### Subscription endpoints (all require Clerk auth, any role)

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/intelligence/subscribe` | Returns caller's full subscription state |
| `POST` | `/api/intelligence/subscribe` | Creates/reactivates subscription |
| `DELETE` | `/api/intelligence/subscribe` | Deactivates subscription (keeps selections) |
| `POST` | `/api/intelligence/subscribe/attendees` | Add attendee selection, increment count |
| `DELETE` | `/api/intelligence/subscribe/attendees/[id]` | Remove attendee selection, decrement count |
| `POST` | `/api/intelligence/subscribe/companies` | Add company selection, increment count |
| `DELETE` | `/api/intelligence/subscribe/companies/[id]` | Remove company selection, decrement count |
| `POST` | `/api/intelligence/subscribe/events` | Add event selection, increment count |
| `DELETE` | `/api/intelligence/subscribe/events/[id]` | Remove event selection, decrement count |

`GET /api/intelligence/subscribe` response shape:
```json
{
  "active": true,
  "selectedAttendeeIds": ["..."],
  "selectedCompanyIds": ["..."],
  "selectedEventIds": ["..."],
  "lastBriefing": { "sentAt": "...", "targetCount": 7 }
}
```

The subscribe toggle is disabled in the UI until ≥1 entity is selected. The API itself does not enforce this order.

### Targets endpoint — `GET /api/intelligence/targets`

Returns all entities where `subscriptionCount > 0`. Replaces the previous meeting-window prioritization logic. No cap.

```json
{
  "generatedAt": "...",
  "companies": [{ "name": "AT&T", "pipelineValue": 2500000, "subscriptionCount": 3 }],
  "attendees": [{ "name": "Jane Smith", "title": "VP Network Strategy", "company": "AT&T", "subscriptionCount": 2 }],
  "events": [{ "name": "MWC Barcelona 2026", "startDate": "2026-03-24", "endDate": "2026-03-27", "status": "CONFIRMED", "subscriptionCount": 5 }]
}
```

OpenClaw researches each entity in `companies` and `attendees`, plus all companies and attendees linked to each entity in `events`.

### Webhook handler — `POST /api/webhooks/intel-report`

Subscriber matching logic:

1. For each active subscriber, load `selectedAttendeeIds`, `selectedCompanyIds`, `selectedEventIds`
2. Match `updatedTargets[]` against directly selected entities (case-insensitive name match)
3. Also match against all attendees/companies linked to their selected events
4. Entities matched via both direct selection AND event linkage are marked `highlighted: true`
5. No matches → log as `skipped`, continue
6. Matches → compose personalised HTML email via Gemini → send via nodemailer
7. After all personalized reports: fetch all `root`/`marketing` users via Clerk backend SDK → send aggregate report to each

---

## Subscription UI (`/intelligence/subscribe`)

Three sections — Events, Companies, Attendees — each with checkboxes. A single search bar filters all three simultaneously, matching against: event name/dates/status, company name/description, attendee name/title/company name.

```
┌─────────────────────────────────────────────────────────┐
│  Market Intelligence Subscription                       │
│                                                         │
│  [toggle: disabled until ≥1 selected]                   │
│  Send briefings to geoff@rakutensymphony.com            │
│  Last briefing: Tuesday 11 March 2026 · 7 targets       │
│                                                         │
│  [ Search all events, companies, attendees... ]         │
│                                                         │
│  ── Events (3 selected) ─────────────────────────────   │
│  [ ] MWC Barcelona 2026  Mar 24–27  CONFIRMED           │
│  [✓] DTW Amsterdam 2026  Jun 17–19  CONFIRMED           │
│                                                         │
│  ── Companies (12 selected) ─────────────────────────   │
│  [✓] AT&T         Pipeline: $2.5M                       │
│  [ ] Verizon       Pipeline: $1.8M                      │
│                                                         │
│  ── Attendees (5 selected) ──────────────────────────   │
│  [✓] Jane Smith    VP Network Strategy · AT&T           │
│  [ ] Tom Baker     CTO · Verizon                        │
└─────────────────────────────────────────────────────────┘
```

**Behaviour:**
- Checkboxes call selection API endpoints immediately (optimistic UI, revert on error)
- Subscribe toggle enables as soon as ≥1 entity is checked; shows tooltip while disabled
- Section headers show selected count badge
- Sections with zero search results are hidden
- Page loads existing subscription state on mount via `GET /api/intelligence/subscribe`

---

## Email Reports

### Personalized report (active subscribers with matches)

Gemini prompt structure:
- Directly selected targets with updates → marked `[DIRECT SELECTION]` with `⭐` callout
- Event-linked targets with updates → grouped by event
- Upcoming events table
- Unsubscribe footer
- Max 800 words, sharp B2B tone

### Aggregate report (root/marketing — automatic, no opt-in)

- Triggered on every webhook run for all users with Clerk `publicMetadata.role` of `root` or `marketing`
- Contains ALL updated targets from the run, grouped by type (Companies / Attendees / Events)
- No subscriber matching, no personalization, no unsubscribe link
- Sent regardless of whether the recipient has an `IntelligenceSubscription` record
- Logged to `IntelligenceEmailLog` with `status: 'aggregate'`

---

## Export / Import

### System export (`GET /api/admin/system/export`)

Add to payload:
```json
{
  "intelligenceSubscriptions": [
    {
      "id": "...",
      "userId": "...",
      "email": "...",
      "active": true,
      "unsubscribeToken": "...",
      "selectedAttendeeIds": ["..."],
      "selectedCompanyIds": ["..."],
      "selectedEventIds": ["..."]
    }
  ]
}
```

`IntelligenceReport` and `IntelligenceEmailLog` are excluded (operational logs, not configuration).

### System import (`POST /api/admin/system/import`)

After restoring attendees/companies/events:
1. Upsert each `IntelligenceSubscription` by `userId`
2. Upsert junction rows (skip gracefully if referenced ID doesn't exist)
3. Recompute `subscriptionCount` for all entities from junction row counts (avoids stale counts)

### Event-level export (`GET /api/events/[id]/export`) — new endpoint

Returns event-scoped data plus subscription selections for entities in that event:
```json
{
  "event": { "..." },
  "rooms": [],
  "meetings": [],
  "attendees": [],
  "intelligenceSubscriptions": [
    {
      "userId": "...",
      "email": "...",
      "active": true,
      "selectedAttendeeIds": [],
      "selectedCompanyIds": [],
      "selectedEventIds": []
    }
  ]
}
```

### Event-level import (`POST /api/events/[id]/import`) — new endpoint

Restores event-scoped entities and subscription selections. Skips junction rows for entities not present after import. Recomputes `subscriptionCount` for affected entities.

---

## New Files Summary

| Path | Description |
|------|-------------|
| `app/api/intelligence/subscribe/route.ts` | GET / POST / DELETE subscription |
| `app/api/intelligence/subscribe/attendees/route.ts` | POST add attendee selection |
| `app/api/intelligence/subscribe/attendees/[id]/route.ts` | DELETE remove attendee selection |
| `app/api/intelligence/subscribe/companies/route.ts` | POST add company selection |
| `app/api/intelligence/subscribe/companies/[id]/route.ts` | DELETE remove company selection |
| `app/api/intelligence/subscribe/events/route.ts` | POST add event selection |
| `app/api/intelligence/subscribe/events/[id]/route.ts` | DELETE remove event selection |
| `app/api/events/[id]/export/route.ts` | Event-level export |
| `app/api/events/[id]/import/route.ts` | Event-level import |
| `app/intelligence/subscribe/page.tsx` | Subscription management UI (replaced) |
| `prisma/migrations/...` | Migration for subscriptionCount fields + 3 junction tables |

### Modified files

| Path | Change |
|------|--------|
| `prisma/schema.prisma` | Add subscriptionCount to Attendee/Company/Event; add 3 junction models |
| `app/api/intelligence/targets/route.ts` | Replace meeting-window logic with subscriptionCount > 0 query |
| `app/api/webhooks/intel-report/route.ts` | New subscriber matching + aggregate report dispatch |
| `lib/intelligence-email.ts` | Updated Gemini prompts for highlighted + event-linked sections; new aggregate email composer |
| `app/api/admin/system/export/route.ts` | Add intelligenceSubscriptions to payload |
| `app/api/admin/system/import/route.ts` | Restore subscriptions + recompute counts |
