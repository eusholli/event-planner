# Autonomous Market Intelligence System — Design

**Date:** 2026-03-09
**Status:** Approved
**Scope:** event-planner (NextJS) + OpenClaw (Kenji agent)

---

## Overview

An autonomous marketing intelligence pipeline that researches target companies and contacts twice weekly (Tue/Thu), then delivers personalised email briefings to subscribed internal users. Research is performed by the OpenClaw Kenji agent (which has accumulated telecom B2B memory); personalization, email generation, and delivery are handled by the NextJS app.

---

## Architecture

```
[OpenClaw Cron - Tue/Thu 6AM]
        │
        ├─ web_fetch GET /api/intelligence/targets  ← pull priority targets from DB
        │
        ├─ Research each target (web_search, memory/ files)
        │
        └─ POST /api/webhooks/intel-report          ← push intelligence payload
                │
        [NextJS Webhook Handler]
                │
                ├─ Store in IntelligenceReport table
                │
                ├─ Query all active IntelligenceSubscription records
                │
                ├─ For each subscriber:
                │     ├─ Find Attendee record by email
                │     ├─ Get meetings → companies + external attendees
                │     ├─ Cross-reference against updated targets in payload
                │     ├─ Query upcoming events (next 30 days)
                │     └─ If matches → Gemini composes email → nodemailer sends
                │
        [Subscriber inbox]
```

**Key boundaries:**
- OpenClaw is responsible for research quality only — delivers structured JSON
- NextJS is responsible for subscriber matching, personalization, and all outbound email
- `IntelligenceReport` table is an audit log — every run is stored, emails are traceable
- Both new endpoints protected by `INTELLIGENCE_SECRET_KEY` (same pattern as `BACKUP_SECRET_KEY`)

---

## Data Model

### New Prisma models

```prisma
model IntelligenceSubscription {
  id        String   @id @default(cuid())
  userId    String   @unique  // Clerk user ID
  email     String            // denormalized for dispatch
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model IntelligenceReport {
  id          String   @id @default(cuid())
  runId       String            // e.g. "2026-03-11-cron"
  targetType  String            // "company" | "attendee"
  targetName  String            // matches Company.name or Attendee.name
  summary     String            // 2-3 sentence update
  salesAngle  String            // "so what" for internal team
  fullReport  String            // full markdown from Kenji
  createdAt   DateTime @default(now())

  @@index([runId])
  @@index([targetName])
}

model IntelligenceEmailLog {
  id          String   @id @default(cuid())
  runId       String
  userId      String
  email       String
  sentAt      DateTime @default(now())
  targetCount Int
  status      String   // "sent" | "failed" | "skipped"

  @@index([runId, userId])
}
```

---

## Phase 1: Data Bridge

**Endpoint:** `GET /api/intelligence/targets`
**Auth:** `Authorization: Bearer <INTELLIGENCE_SECRET_KEY>`
**Called by:** OpenClaw Cron at start of each run

### Prioritization logic

- **Companies:** any company with at least one meeting in an event within [-90 days, +60 days] window, sorted by `pipelineValue` descending, capped at 20
- **Attendees:** `seniorityLevel` IN ['C-Level', 'VP'], at least one meeting in the same [-90, +60] window, capped at 20
- **Upcoming events:** `Event.startDate` within next 30 days, status != CANCELED

Meeting date window uses `Event.startDate` as anchor (joined through `Meeting.eventId → Event.startDate`).

### Response shape

```json
{
  "generatedAt": "2026-03-11T06:00:00Z",
  "companies": [
    { "name": "AT&T", "pipelineValue": 2500000, "upcomingMeetings": 3 }
  ],
  "attendees": [
    { "name": "Jane Smith", "title": "VP Network Strategy", "company": "AT&T", "seniorityLevel": "VP", "upcomingMeetings": 1 }
  ],
  "upcomingEvents": [
    { "name": "MWC Barcelona 2026", "startDate": "2026-03-24", "endDate": "2026-03-27", "status": "CONFIRMED" }
  ]
}
```

---

## Phase 2: OpenClaw Cron Job

**Schedule:** Tuesday and Thursday, 6:00 AM (Mac local time)
**Agent:** Kenji (main agent)

### Cron prompt

```
You are running an autonomous market intelligence cycle for Rakuten Symphony's
event pipeline. Follow these steps exactly:

1. FETCH TARGETS
   web_fetch GET https://<app-url>/api/intelligence/targets
   Header: Authorization: Bearer <INTELLIGENCE_SECRET_KEY>
   Parse into companies[], attendees[], and upcomingEvents[].

2. RESEARCH EACH TARGET
   For each company and attendee:
   a. Check memory/{Target_Name}.md — if updated within 48 hours, skip it.
   b. Otherwise run ONE web_search: "<Target> telecom B2B strategy
      announcements 2026" with freshness: "pw".
   c. If a second angle is missing (exec change, acquisition, spectrum),
      add ONE more web_search. Max 2 per target.
   d. Synthesize: what changed, and why it matters to Rakuten Symphony's
      radio/cloud/automation portfolio.
   e. Update memory/{Target_Name}.md with new findings.

3. BUILD PAYLOAD
   {
     "runId": "YYYY-MM-DD-cron",
     "timestamp": "<ISO>",
     "updatedTargets": [
       {
         "type": "company" | "attendee",
         "name": "<exact name from targets response>",
         "summary": "<2-3 sentence update>",
         "salesAngle": "<1 sentence: why this matters to RS portfolio>",
         "fullReport": "<full markdown>"
       }
     ]
   }
   Include only targets with new/updated intelligence.
   If no targets updated, send payload with empty updatedTargets[].

4. DELIVER
   web_fetch POST <app-url>/api/webhooks/intel-report
   Header: Authorization: Bearer <INTELLIGENCE_SECRET_KEY>
   Body: JSON payload from step 3.
   Confirm HTTP 200.

5. LOG
   Append summary to memory/YYYY-MM-DD.md:
   targets fetched, researched, skipped, POST status.
```

**Notes:**
- 48-hour freshness check prevents re-researching targets updated on Tuesday when Thursday runs
- `name` in payload must exactly match the DB value from the targets response
- Empty `updatedTargets[]` still fires so the run is logged

---

## Phase 3: Webhook Handler, Subscriber Matching & Email

### Endpoint: `POST /api/webhooks/intel-report`

**Auth:** `Authorization: Bearer <INTELLIGENCE_SECRET_KEY>`
**Not** behind Clerk auth — called by OpenClaw, not a browser.

### Handler logic

1. Validate secret key → 401 if wrong
2. Parse payload, validate `runId` + `updatedTargets[]`
3. Upsert each target into `IntelligenceReport` (idempotent on `runId` + `targetName`)
4. If `updatedTargets[]` is empty → log run as completed, return 200, stop
5. Fetch all active `IntelligenceSubscription` records
6. For each subscriber:
   - Find `Attendee` record by email (skip gracefully if not found)
   - Get all meetings via `AttendeeMeetings` → include `meeting.attendees` + `meeting.event`
   - Collect unique companies from external attendees in those meetings
   - Collect unique attendee names from external attendees in those meetings
   - Cross-reference against `updatedTargets[]` (case-insensitive name match)
   - Query upcoming events (next 30 days, status != CANCELED)
   - If no matches → log as "skipped", continue
   - If matches → compose + send email
7. Return 200

### Email composition

Gemini 2.5 Pro called once per subscriber:

```
You are composing a market intelligence briefing email for an internal
Rakuten Symphony sales/marketing team member.

Recipient: <name> (<email>)

Their relevant contacts and companies have the following intelligence updates:
<matched targets with summary + salesAngle + fullReport>

Upcoming events in the next 30 days:
<upcomingEvents list>

Write a concise, professional HTML email. Structure:
1. Subject line (return separately as "Subject: ...")
2. Opening: 1 sentence personalised to their specific contacts
3. Per updated target: company/person name as heading, 2-3 bullet points
   of key updates, 1 "Sales Angle" callout
4. Upcoming events section: simple table (name, dates, status)
5. Footer: "Unsubscribe" link → <app-url>/api/intelligence/unsubscribe?token=<userId>

Tone: sharp, B2B sales, no fluff. Max 600 words.
```

### Unsubscribe

`GET /api/intelligence/unsubscribe?token=<userId>` — sets `IntelligenceSubscription.active = false`, redirects to confirmation page. One click, no email confirmation required.

---

## Phase 4: Subscription Management UI

**Route:** `/intelligence/subscribe`
**Access:** All authenticated users (any role)

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Market Intelligence Subscription                   │
│                                                     │
│  Receive a personalised intelligence briefing       │
│  after each research cycle (Tue & Thu mornings).    │
│                                                     │
│  Your report covers companies and contacts from     │
│  your meetings, plus upcoming events.               │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [toggle]  Send briefings to               │   │
│  │            geoff@rakutensymphony.com        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Last briefing sent: Tuesday 11 March 2026          │
│  Targets in your last report: 7 companies, 3 people │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Email pre-populated from Clerk — not editable
- Toggle calls `POST /api/intelligence/subscribe` (create/reactivate) or `DELETE /api/intelligence/subscribe` (deactivate)
- "Last briefing sent" and target count from `IntelligenceEmailLog`
- If no `Attendee` record found for user's email: show callout — *"You haven't been added to any meetings yet. Subscribe anyway and you'll receive briefings once you're included."*

**Navigation:** "Subscribe to Briefings" link added to `/intelligence` page header.

---

## Security

### New environment variable

```bash
INTELLIGENCE_SECRET_KEY   # shared secret for targets endpoint and webhook
```

### Threat model

- Both endpoints validate `Authorization: Bearer <key>` — 401 if missing/wrong
- Targets endpoint returns company names and pipeline values — sensitive, secret-protected
- Webhook endpoint writes to DB and triggers emails — must not be publicly callable
- Unsubscribe uses Clerk `userId` as token — not guessable, acceptable for low-stakes action
- Webhook rejects duplicate `runId` submissions via idempotent upsert — prevents double-sends on retry

### OpenClaw

- `INTELLIGENCE_SECRET_KEY` stored in OpenClaw credentials or cron env — never committed to workspace repo
- Cron prompt references key via environment variable placeholder

---

## New Files Summary

### NextJS app

| Path | Description |
|------|-------------|
| `app/api/intelligence/targets/route.ts` | Phase 1 targets endpoint |
| `app/api/intelligence/subscribe/route.ts` | POST/DELETE subscription |
| `app/api/intelligence/unsubscribe/route.ts` | GET unsubscribe |
| `app/api/webhooks/intel-report/route.ts` | Phase 3 webhook handler |
| `app/intelligence/subscribe/page.tsx` | Subscription management UI |
| `lib/intelligence-email.ts` | Gemini email composition + nodemailer dispatch |
| `prisma/migrations/...` | Migration for 3 new models |

### OpenClaw workspace

| Path | Description |
|------|-------------|
| `~/.openclaw/cron/jobs.json` | Cron job entry (Tue/Thu 6AM) |

---

## Open Questions / Future Considerations

- If the subscriber has no meetings yet, they get no report. Consider a fallback: send the top 5 company updates regardless, as a general briefing.
- The 20-target cap may need tuning once the DB grows. Monitor cron run duration in `memory/` logs.
- `INTELLIGENCE_SECRET_KEY` rotation: document a rotation procedure (update env var + OpenClaw cron prompt atomically).
