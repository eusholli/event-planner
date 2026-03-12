# V5 Export/Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the export/import system to a portable V5 format with name-based references, company support, and Clerk-based `authorizedUserIds` ↔ `authorizedEmails` translation.

**Architecture:** A shared Clerk helper (`lib/clerk-export.ts`) provides userId↔email translation. The system export (`app/api/settings/export/route.ts`) and event export (`lib/actions/event.ts → exportEventData`) both write V5 format. Their corresponding import functions resolve name references back to DB IDs. A Python script (`db-json/process_data.py`) generates `master-data-030926-v5.json` offline from V4 data + latest MWC source.

**Tech Stack:** Next.js App Router, Prisma, `@clerk/nextjs/server`, TypeScript, Python 3 + pytest

**Spec:** `docs/superpowers/specs/2026-03-12-v5-export-import-design.md`

---

## Chunk 1: Foundation — Schema Migration + Clerk Helper

### Task 1: Add Room unique constraint

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_room_name_event_unique/`

- [ ] **Step 1: Add `@@unique` to Room model**

In `prisma/schema.prisma`, find the `Room` model and add the constraint:

```prisma
model Room {
  id       String    @id @default(cuid())
  name     String
  capacity Int
  eventId  String?
  meetings Meeting[]
  event    Event?    @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([name, eventId])
}
```

- [ ] **Step 2: Create and apply the migration**

```bash
cd /Users/eusholli/dev/event-planner
npx prisma migrate dev --name room_name_event_unique
```

Expected: migration file created under `prisma/migrations/`, Prisma client regenerated with no errors.

- [ ] **Step 3: Verify build still passes**

```bash
npm run build
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add unique constraint Room(name, eventId) for V5 import"
```

---

### Task 2: Create Clerk export helper

**Files:**
- Create: `lib/clerk-export.ts`

This helper provides two functions used by both system and event export/import routes:
- `userIdsToEmails(userIds)` — resolves Clerk user IDs to primary email addresses; throws on any API failure
- `emailsToUserIds(emails)` — resolves emails to Clerk user IDs; returns found entries and skipped emails

- [ ] **Step 1: Create `lib/clerk-export.ts`**

```typescript
import { clerkClient } from '@clerk/nextjs/server'

/**
 * Resolve Clerk user IDs to their primary email addresses.
 * Throws if any Clerk API call fails (network error, user not found, etc.).
 */
export async function userIdsToEmails(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return []
    const client = await clerkClient()
    const emails: string[] = []
    for (const userId of userIds) {
        const user = await client.users.getUser(userId)
        const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)
            ?? user.emailAddresses[0]
        if (!primary?.emailAddress) {
            throw new Error(`Clerk user ${userId} has no email address`)
        }
        emails.push(primary.emailAddress)
    }
    return emails
}

/**
 * Resolve email addresses to Clerk user IDs.
 * Emails not found in this Clerk instance are silently skipped — the caller
 * is responsible for adding warnings to the import response.
 */
export async function emailsToUserIds(
    emails: string[]
): Promise<{ resolved: { email: string; userId: string }[]; missing: string[] }> {
    if (emails.length === 0) return { resolved: [], missing: [] }
    const client = await clerkClient()
    const resolved: { email: string; userId: string }[] = []
    const missing: string[] = []
    for (const email of emails) {
        const result = await client.users.getUserList({ emailAddress: [email] })
        if (result.data.length > 0) {
            resolved.push({ email, userId: result.data[0].id })
        } else {
            missing.push(email)
        }
    }
    return { resolved, missing }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/eusholli/dev/event-planner && npm run build
```

Expected: exits 0 with no errors referencing `lib/clerk-export.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/clerk-export.ts
git commit -m "feat: add Clerk userId<->email helper for V5 export/import"
```

---

## Chunk 2: System Export

### Task 3: Rewrite system export route for V5

**Files:**
- Modify: `app/api/settings/export/route.ts`

Replace the export logic to output V5 format: add companies, use name-based references everywhere, translate `authorizedUserIds` → `authorizedEmails` via Clerk.

- [ ] **Step 1: Replace the body of `exportData()` in `app/api/settings/export/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'
import { userIdsToEmails } from '@/lib/clerk-export'

export const dynamic = 'force-dynamic'

async function exportData(): Promise<Response> {
    try {
        const settings = await prisma.systemSettings.findFirst()
        const companies = await prisma.company.findMany()
        const events = await prisma.event.findMany({
            include: { roiTargets: { include: { targetCompanies: true } } }
        })
        const attendees = await prisma.attendee.findMany()
        const rooms = await prisma.room.findMany()
        const meetings = await prisma.meeting.findMany({
            include: { room: true, attendees: true }
        })

        // Build lookup maps
        const companyIdToName = new Map(companies.map(c => [c.id, c.name]))
        const eventIdToName = new Map(events.map(e => [e.id, e.name]))

        // System settings
        const systemOut = settings ? {
            geminiApiKey: settings.geminiApiKey,
            defaultTags: settings.defaultTags,
            defaultMeetingTypes: settings.defaultMeetingTypes,
            defaultAttendeeTypes: settings.defaultAttendeeTypes,
        } : null

        // Companies: strip id
        const companiesOut = companies.map(c => ({
            name: c.name,
            description: c.description,
            pipelineValue: c.pipelineValue,
        }))

        // Events: strip id, translate authorizedUserIds → authorizedEmails, targetCompanyIds → targetCompanyNames
        const eventsOut: any[] = []
        for (const event of events) {
            const { id, roiTargets, authorizedUserIds, ...eventRest } = event as any

            // Translate authorizedUserIds → authorizedEmails (throws on Clerk failure)
            const authorizedEmails = await userIdsToEmails(authorizedUserIds ?? [])

            const roiOut = roiTargets ? (() => {
                const { id: _id, eventId: _eid, event: _ev, targetCompanies, ...roiRest } = roiTargets as any
                return {
                    ...roiRest,
                    targetCompanyNames: (targetCompanies ?? []).map((c: any) => c.name),
                }
            })() : null

            eventsOut.push({
                ...eventRest,
                authorizedEmails,
                roiTargets: roiOut,
            })
        }

        // Attendees: strip id, companyId → companyName
        const attendeesOut = attendees.map(a => {
            const { id, companyId, ...rest } = a as any
            return { ...rest, companyName: companyIdToName.get(companyId) ?? '' }
        })

        // Rooms: strip id, eventId → eventName
        const roomsOut = rooms.map(r => {
            const { id, eventId, ...rest } = r as any
            return { ...rest, eventName: eventIdToName.get(eventId ?? '') ?? '' }
        })

        // Meetings: strip id/roomId/eventId, eventId → eventName, attendees → emails
        const meetingsOut = meetings.map(m => {
            const { id, roomId, eventId, room, attendees, ...rest } = m as any
            return {
                ...rest,
                eventName: eventIdToName.get(eventId) ?? '',
                room: room?.name ?? null,
                attendees: attendees.map((a: any) => a.email),
            }
        })

        const exportDataObj = {
            version: '5.0',
            exportedAt: new Date().toISOString(),
            system: systemOut,
            companies: companiesOut,
            events: eventsOut,
            attendees: attendeesOut,
            rooms: roomsOut,
            meetings: meetingsOut,
        }

        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `system-backup-${date}.json`

        return new NextResponse(JSON.stringify(exportDataObj, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })
    } catch (error) {
        console.error('Export error:', error)
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
    }
}

const getHandler = withAuth(async () => {
    return exportData()
}, { requireRole: 'root' })

export async function GET(request: Request, ctx: { params: Promise<Record<string, string>> }) {
    const backupKey = request.headers.get('x-backup-key') ?? request.headers.get('authorization')?.replace('Bearer ', '')
    if (backupKey && process.env.BACKUP_SECRET_KEY && backupKey === process.env.BACKUP_SECRET_KEY) {
        return exportData()
    }
    return getHandler(request, ctx as any)
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/eusholli/dev/event-planner && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke test (if dev server accessible)**

Start the dev server (`npm run dev`), authenticate as root, then:
```bash
curl -H "Authorization: Bearer $BACKUP_SECRET_KEY" http://localhost:3000/api/settings/export | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('version:', d.get('version'))
print('keys:', list(d.keys()))
print('companies count:', len(d.get('companies', [])))
print('first company:', d.get('companies', [{}])[0])
att = d.get('attendees', [{}])[0]
print('first attendee has companyName?', 'companyName' in att)
print('first attendee has companyId?', 'companyId' in att)
room = d.get('rooms', [{}])[0]
print('first room has eventName?', 'eventName' in room)
"
```

Expected: `version: 5.0`, `companyName` present, `companyId` absent, `eventName` present on rooms.

- [ ] **Step 4: Commit**

```bash
git add app/api/settings/export/route.ts
git commit -m "feat: rewrite system export to V5 format with companies and name-based refs"
```

---

## Chunk 3: System Import

### Task 4: Rewrite system import route for V5

**Files:**
- Modify: `app/api/settings/import/route.ts`

Complete rewrite: handle companies, fix multi-event room/attendee/meeting linking, upsert meetings, add ROI targets import, resolve `authorizedEmails` → `authorizedUserIds`.

- [ ] **Step 1: Replace the entire `app/api/settings/import/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { geocodeAddress } from '@/lib/geocoding'
import { withAuth } from '@/lib/with-auth'
import { emailsToUserIds } from '@/lib/clerk-export'

export const dynamic = 'force-dynamic'

const postHandler = withAuth(async (request) => {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

        const text = await file.text()
        const config = JSON.parse(text)
        const warnings: string[] = []

        if (config.version && config.version !== '5.0') {
            warnings.push(`File version is ${config.version}, expected 5.0. Import may produce unexpected results.`)
        }

        const parseDates = (obj: any) => {
            const out: any = { ...obj }
            for (const key in out) {
                if (typeof out[key] === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}.*)?Z?$/.test(out[key])) {
                    const d = new Date(out[key])
                    if (!isNaN(d.getTime())) out[key] = d
                }
            }
            return out
        }

        // 1. System settings
        if (config.system) {
            const { geminiApiKey, defaultTags, defaultMeetingTypes, defaultAttendeeTypes } = config.system
            const existing = await prisma.systemSettings.findFirst()
            const data = {
                geminiApiKey,
                defaultTags: defaultTags ?? [],
                defaultMeetingTypes: defaultMeetingTypes ?? [],
                defaultAttendeeTypes: defaultAttendeeTypes ?? [],
            }
            if (existing) {
                await prisma.systemSettings.update({ where: { id: existing.id }, data })
            } else {
                await prisma.systemSettings.create({ data })
            }
        }

        // 2. Companies — upsert by name
        const companyNameToId = new Map<string, string>()
        if (config.companies && Array.isArray(config.companies)) {
            for (const comp of config.companies) {
                try {
                    const upserted = await prisma.company.upsert({
                        where: { name: comp.name },
                        create: { name: comp.name, description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                        update: { description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                    })
                    companyNameToId.set(comp.name, upserted.id)
                } catch (e) {
                    warnings.push(`Company '${comp.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 3. Events — upsert by name, resolve authorizedEmails → authorizedUserIds
        const eventNameToId = new Map<string, string>()
        if (config.events && Array.isArray(config.events)) {
            for (const evt of config.events) {
                try {
                    const parsed = parseDates(evt)
                    const { roiTargets, authorizedEmails, ...eventFields } = parsed

                    // Resolve authorizedEmails → authorizedUserIds
                    let authorizedUserIds: string[] = []
                    if (Array.isArray(authorizedEmails) && authorizedEmails.length > 0) {
                        const { resolved, missing } = await emailsToUserIds(authorizedEmails)
                        authorizedUserIds = resolved.map(r => r.userId)
                        for (const email of missing) {
                            warnings.push(`Event '${evt.name}': authorized user '${email}' not found in Clerk — skipped`)
                        }
                    }

                    // Geocode if needed
                    if (eventFields.address && !eventFields.latitude) {
                        try {
                            const geo = await geocodeAddress(eventFields.address)
                            if (geo) { eventFields.latitude = geo.latitude; eventFields.longitude = geo.longitude }
                        } catch { /* non-fatal */ }
                    }

                    // Resolve slug collision for both create and update paths
                    const resolveSlug = async (desiredSlug: string, excludeId?: string): Promise<string> => {
                        if (!desiredSlug) return desiredSlug
                        const conflict = await prisma.event.findFirst({
                            where: { slug: desiredSlug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }
                        })
                        return conflict ? `${desiredSlug}-${Math.random().toString(36).slice(2, 7)}` : desiredSlug
                    }

                    const existing = await prisma.event.findFirst({ where: { name: eventFields.name } })
                    let eventId: string
                    if (existing) {
                        const slug = await resolveSlug(eventFields.slug, existing.id)
                        await prisma.event.update({
                            where: { id: existing.id },
                            data: { ...eventFields, slug, authorizedUserIds },
                        })
                        eventId = existing.id
                    } else {
                        const slug = await resolveSlug(eventFields.slug)
                        const created = await prisma.event.create({
                            data: { ...eventFields, slug, authorizedUserIds },
                        })
                        eventId = created.id
                    }
                    eventNameToId.set(eventFields.name, eventId)
                } catch (e) {
                    warnings.push(`Event '${evt.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 4. Rooms — resolve eventName → eventId, upsert by (name, eventId)
        const roomKeyToId = new Map<string, string>() // key: `${eventName}::${roomName}`
        if (config.rooms && Array.isArray(config.rooms)) {
            for (const room of config.rooms) {
                try {
                    const eventId = eventNameToId.get(room.eventName)
                    if (!eventId) {
                        warnings.push(`Room '${room.name}': event '${room.eventName}' not found — skipped`)
                        continue
                    }
                    const existing = await prisma.room.findFirst({ where: { name: room.name, eventId } })
                    let roomId: string
                    if (existing) {
                        await prisma.room.update({ where: { id: existing.id }, data: { capacity: room.capacity } })
                        roomId = existing.id
                    } else {
                        const created = await prisma.room.create({ data: { name: room.name, capacity: room.capacity, eventId } })
                        roomId = created.id
                    }
                    roomKeyToId.set(`${room.eventName}::${room.name}`, roomId)
                } catch (e) {
                    warnings.push(`Room '${room.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 5. Attendees — resolve companyName → companyId, upsert by email
        const emailToAttendeeId = new Map<string, string>()
        if (config.attendees && Array.isArray(config.attendees)) {
            for (const att of config.attendees) {
                try {
                    let companyId = companyNameToId.get(att.companyName)
                    if (!companyId && att.companyName) {
                        // Create company on-the-fly if missing
                        const co = await prisma.company.upsert({
                            where: { name: att.companyName },
                            create: { name: att.companyName },
                            update: {},
                        })
                        companyId = co.id
                        companyNameToId.set(att.companyName, companyId)
                    }
                    if (!companyId) {
                        warnings.push(`Attendee '${att.email}': no companyName — skipped`)
                        continue
                    }

                    // Determine which event to connect this attendee to
                    const eventName = att.eventName // optional field; system export doesn't have per-attendee eventName
                    const eventId = eventName ? eventNameToId.get(eventName) : undefined

                    const upserted = await prisma.attendee.upsert({
                        where: { email: att.email },
                        create: {
                            name: att.name, email: att.email, title: att.title ?? '',
                            companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                            imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                            type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                            events: eventId ? { connect: { id: eventId } } : undefined,
                        },
                        update: {
                            name: att.name, title: att.title ?? '',
                            companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                            imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                            type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                            events: eventId ? { connect: { id: eventId } } : undefined,
                        },
                    })
                    emailToAttendeeId.set(att.email, upserted.id)
                } catch (e) {
                    warnings.push(`Attendee '${att.email}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 6. Meetings — upsert by (title, date, startTime, eventId)
        if (config.meetings && Array.isArray(config.meetings)) {
            for (const mtg of config.meetings) {
                try {
                    const eventId = eventNameToId.get(mtg.eventName)
                    if (!eventId) {
                        warnings.push(`Meeting '${mtg.title}': event '${mtg.eventName}' not found — skipped`)
                        continue
                    }

                    const roomId = mtg.room
                        ? roomKeyToId.get(`${mtg.eventName}::${mtg.room}`) ?? null
                        : null

                    const attendeeConnects = (mtg.attendees ?? [])
                        .map((email: string) => emailToAttendeeId.get(email))
                        .filter(Boolean)
                        .map((id: string) => ({ id }))

                    const existing = await prisma.meeting.findFirst({
                        where: { title: mtg.title, date: mtg.date, startTime: mtg.startTime, eventId }
                    })

                    const commonFields = {
                        title: mtg.title, purpose: mtg.purpose ?? null,
                        date: mtg.date, startTime: mtg.startTime, endTime: mtg.endTime,
                        sequence: mtg.sequence ?? 0, status: mtg.status ?? 'PIPELINE',
                        tags: mtg.tags ?? [], meetingType: mtg.meetingType ?? null,
                        location: mtg.location ?? null, otherDetails: mtg.otherDetails ?? null,
                        isApproved: mtg.isApproved ?? false,
                        calendarInviteSent: mtg.calendarInviteSent ?? false,
                        createdBy: mtg.createdBy ?? null, requesterEmail: mtg.requesterEmail ?? null,
                        roomId, eventId,
                    }

                    if (existing) {
                        await prisma.meeting.update({
                            where: { id: existing.id },
                            data: { ...commonFields, attendees: { set: attendeeConnects } },
                        })
                    } else {
                        await prisma.meeting.create({
                            data: { ...commonFields, attendees: { connect: attendeeConnects } },
                        })
                    }
                } catch (e) {
                    warnings.push(`Meeting '${mtg.title}': import failed — ${(e as Error).message}`)
                }
            }
        }

        // 7. ROI Targets — upsert per event
        if (config.events && Array.isArray(config.events)) {
            for (const evt of config.events) {
                if (!evt.roiTargets) continue
                const eventId = eventNameToId.get(evt.name)
                if (!eventId) continue
                try {
                    const roi = evt.roiTargets
                    const targetCompanyConnect = await Promise.all(
                        (roi.targetCompanyNames ?? []).map(async (name: string) => {
                            let id = companyNameToId.get(name)
                            if (!id) {
                                const co = await prisma.company.upsert({
                                    where: { name }, create: { name }, update: {},
                                })
                                id = co.id
                            }
                            return { id }
                        })
                    )

                    const roiData = {
                        expectedPipeline: roi.expectedPipeline ?? null,
                        winRate: roi.winRate ?? null,
                        expectedRevenue: roi.expectedRevenue ?? null,
                        targetCustomerMeetings: roi.targetCustomerMeetings ?? null,
                        targetErta: roi.targetErta ?? null,
                        targetSpeaking: roi.targetSpeaking ?? null,
                        targetMediaPR: roi.targetMediaPR ?? null,
                        actualErta: roi.actualErta ?? null,
                        actualSpeaking: roi.actualSpeaking ?? null,
                        actualMediaPR: roi.actualMediaPR ?? null,
                        status: roi.status ?? 'DRAFT',
                        approvedBy: roi.approvedBy ?? null,
                        approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null,
                        submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null,
                        rejectedBy: roi.rejectedBy ?? null,
                        rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null,
                    }

                    await prisma.eventROITargets.upsert({
                        where: { eventId },
                        create: { event: { connect: { id: eventId } }, ...roiData, targetCompanies: { connect: targetCompanyConnect } },
                        update: { ...roiData, targetCompanies: { set: targetCompanyConnect } },
                    })
                } catch (e) {
                    warnings.push(`ROI targets for '${evt.name}': import failed — ${(e as Error).message}`)
                }
            }
        }

        return NextResponse.json({ success: true, warnings })
    } catch (error) {
        console.error('Import error:', error)
        return NextResponse.json({ error: 'Failed to import data' }, { status: 500 })
    }
}, { requireRole: 'root' })

export const POST = postHandler as any
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/eusholli/dev/event-planner && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/import/route.ts
git commit -m "feat: rewrite system import for V5 — companies, multi-event linking, upsert meetings, ROI targets"
```

---

## Chunk 4: Event Export

### Task 5: Update `exportEventData` in `lib/actions/event.ts`

**Files:**
- Modify: `lib/actions/event.ts` (function `exportEventData` only, lines ~120–219)

Replace UUID-based cross-references with name-based ones, translate `authorizedUserIds` → `authorizedEmails`, bump version to `5.0`.

- [ ] **Step 1: Replace the `exportEventData` function**

Replace the entire `exportEventData` function (lines 120–219 in the current file) with:

```typescript
export async function exportEventData(eventId: string) {
    const { userIdsToEmails } = await import('@/lib/clerk-export')

    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            attendees: { include: { company: true } },
            rooms: true,
            meetings: { include: { attendees: true, room: true } },
            roiTargets: { include: { targetCompanies: true } }
        }
    })
    if (!event) throw new Error('Event not found')

    // Collect unique companies from this event's attendees + ROI targets
    const companyMap = new Map<string, any>()
    event.attendees.forEach(att => {
        if (!companyMap.has(att.company.id)) companyMap.set(att.company.id, att.company)
    })
    if (event.roiTargets?.targetCompanies) {
        event.roiTargets.targetCompanies.forEach(comp => {
            if (!companyMap.has(comp.id)) companyMap.set(comp.id, comp)
        })
    }

    // Build lookup maps for name resolution
    const attendeeIdToEmail = new Map(event.attendees.map(a => [a.id, a.email]))
    const roomIdToName = new Map(event.rooms.map(r => [r.id, r.name]))

    // Translate authorizedUserIds → authorizedEmails (throws on Clerk failure)
    const authorizedEmails = await userIdsToEmails(event.authorizedUserIds ?? [])

    // Companies: strip id
    const companiesOut = Array.from(companyMap.values()).map(c => ({
        name: c.name, description: c.description, pipelineValue: c.pipelineValue,
    }))

    // Event: strip id, authorizedUserIds → authorizedEmails
    const { id, authorizedUserIds, attendees: _atts, rooms: _rooms, meetings: _mtgs, roiTargets: _roi, ...eventRest } = event as any
    const eventOut = { ...eventRest, authorizedEmails }

    // Attendees: strip id/companyId, add companyName
    const attendeesOut = event.attendees.map(att => {
        const { id, companyId, company, ...rest } = att as any
        return { ...rest, companyName: company.name }
    })

    // Rooms: strip id/eventId
    const roomsOut = event.rooms.map(r => {
        const { id, eventId, ...rest } = r as any
        return rest
    })

    // Meetings: strip id/eventId/roomId, room → name, attendees → emails
    const meetingsOut = event.meetings.map(mtg => {
        const { id, eventId, roomId, room, attendees, ...rest } = mtg as any
        return {
            ...rest,
            room: room?.name ?? null,
            attendees: attendees.map((a: any) => attendeeIdToEmail.get(a.id) ?? a.email),
        }
    })

    // ROI targets: strip id/eventId, targetCompanyIds → targetCompanyNames
    const roiOut = event.roiTargets ? (() => {
        const { id: _id, eventId: _eid, event: _ev, targetCompanies, ...roiRest } = event.roiTargets as any
        return { ...roiRest, targetCompanyNames: (targetCompanies ?? []).map((c: any) => c.name) }
    })() : null

    // Intelligence subscriptions (already event-scoped — translate IDs to names)
    const eventAttendeeIds = event.attendees.map(a => a.id)
    const relatedSubs = await prisma.intelligenceSubscription.findMany({
        where: {
            OR: [
                { selectedEvents: { some: { eventId: event.id } } },
                { selectedAttendees: { some: { attendeeId: { in: eventAttendeeIds } } } },
            ],
        },
        include: {
            selectedAttendees: { select: { attendeeId: true } },
            selectedCompanies: { select: { companyId: true, company: { select: { name: true } } } },
            selectedEvents: { select: { eventId: true, event: { select: { name: true } } } },
        },
    })

    const intelligenceSubscriptions = relatedSubs.map(s => ({
        userId: s.userId,
        email: s.email,
        active: s.active,
        selectedAttendeeEmails: s.selectedAttendees
            .filter(r => eventAttendeeIds.includes(r.attendeeId))
            .map(r => attendeeIdToEmail.get(r.attendeeId))
            .filter((e): e is string => !!e),
        selectedCompanyNames: s.selectedCompanies.map(r => r.company.name),
        selectedEventNames: s.selectedEvents
            .filter(r => r.eventId === event.id)
            .map(r => r.event.name),
    }))

    return {
        event: eventOut,
        companies: companiesOut,
        attendees: attendeesOut,
        rooms: roomsOut,
        meetings: meetingsOut,
        roiTargets: roiOut,
        intelligenceSubscriptions,
        exportedAt: new Date().toISOString(),
        version: '5.0',
    }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/eusholli/dev/event-planner && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/event.ts
git commit -m "feat: update exportEventData to V5 format — name-based refs, authorizedEmails"
```

---

## Chunk 5: Event Import

### Task 6: Update `importEventData` in `lib/actions/event.ts`

**Files:**
- Modify: `lib/actions/event.ts` (function `importEventData` only, lines ~248–594)

Replace all ID-based upserts with name/email-based equivalents. Resolve `authorizedEmails`, `companyName`, room names, and attendee emails.

- [ ] **Step 1: Replace the entire `importEventData` function**

Replace the function starting at line 248 (`export async function importEventData`) through the end of the file with:

```typescript
export async function importEventData(eventId: string, data: any) {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    const warnings: string[] = []

    if (data.version && data.version !== '5.0') {
        warnings.push(`File version is ${data.version}, expected 5.0.`)
    }

    // Scope check: warn if event name doesn't match
    if (data.event?.name) {
        const targetEvent = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } })
        if (targetEvent && targetEvent.name !== data.event.name) {
            warnings.push(`Importing data from event '${data.event.name}' into event '${targetEvent.name}'.`)
        }
    }

    // 1. Companies — upsert by name
    const companyNameToId = new Map<string, string>()
    if (data.companies && Array.isArray(data.companies)) {
        for (const comp of data.companies) {
            try {
                const upserted = await prisma.company.upsert({
                    where: { name: comp.name },
                    create: { name: comp.name, description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                    update: { description: comp.description ?? null, pipelineValue: comp.pipelineValue ?? null },
                })
                companyNameToId.set(comp.name, upserted.id)
            } catch (e) {
                warnings.push(`Company '${comp.name}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 2. Event update (merge)
    if (data.event) {
        const { authorizedEmails, roiTargets: _roi, ...eventFields } = data.event
        const eventUpdate: any = { ...eventFields }

        // Resolve authorizedEmails → authorizedUserIds
        if (Array.isArray(authorizedEmails)) {
            const { emailsToUserIds } = await import('@/lib/clerk-export')
            const { resolved, missing } = await emailsToUserIds(authorizedEmails)
            eventUpdate.authorizedUserIds = resolved.map(r => r.userId)
            for (const email of missing) {
                warnings.push(`Authorized user '${email}' not found in Clerk — skipped`)
            }
        }

        // Geocode if needed
        if (eventFields.address && !eventFields.latitude) {
            try {
                const geo = await geocodeAddress(eventFields.address)
                if (geo) { eventUpdate.latitude = geo.latitude; eventUpdate.longitude = geo.longitude }
            } catch { /* non-fatal */ }
        }

        await prisma.event.update({ where: { id: eventId }, data: eventUpdate })
    }

    // 3. Rooms — upsert by (name, eventId), build roomNameToId map
    const roomNameToId = new Map<string, string>()
    if (data.rooms && Array.isArray(data.rooms)) {
        for (const room of data.rooms) {
            try {
                const existing = await prisma.room.findFirst({ where: { name: room.name, eventId } })
                let roomId: string
                if (existing) {
                    await prisma.room.update({ where: { id: existing.id }, data: { capacity: room.capacity } })
                    roomId = existing.id
                } else {
                    const created = await prisma.room.create({ data: { name: room.name, capacity: room.capacity, eventId } })
                    roomId = created.id
                }
                roomNameToId.set(room.name, roomId)
            } catch (e) {
                warnings.push(`Room '${room.name}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 4. Attendees — upsert by email, resolve companyName, build emailToAttendeeId map
    const emailToAttendeeId = new Map<string, string>()
    if (data.attendees && Array.isArray(data.attendees)) {
        for (const att of data.attendees) {
            try {
                // Resolve company: companyName (V5) or legacy att.company string
                const nameForCompany = att.companyName ?? att.company
                let companyId = companyNameToId.get(nameForCompany)
                if (!companyId && nameForCompany) {
                    companyId = await resolveCompany(nameForCompany, att.companyDescription)
                    if (companyId) companyNameToId.set(nameForCompany, companyId)
                }
                if (!companyId) {
                    warnings.push(`Attendee '${att.email}': no company — skipped`)
                    continue
                }

                const upserted = await prisma.attendee.upsert({
                    where: { email: att.email },
                    create: {
                        name: att.name, email: att.email, title: att.title ?? '',
                        companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                        imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                        type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                        events: { connect: { id: eventId } },
                    },
                    update: {
                        name: att.name, title: att.title ?? '',
                        companyId, bio: att.bio ?? null, linkedin: att.linkedin ?? null,
                        imageUrl: att.imageUrl ?? null, isExternal: att.isExternal ?? false,
                        type: att.type ?? null, seniorityLevel: att.seniorityLevel ?? null,
                        events: { connect: { id: eventId } },
                    },
                })
                emailToAttendeeId.set(att.email, upserted.id)
            } catch (e) {
                warnings.push(`Attendee '${att.email}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 5. Meetings — upsert by (title, date, startTime, eventId)
    if (data.meetings && Array.isArray(data.meetings)) {
        for (const mtg of data.meetings) {
            try {
                const roomId = mtg.room ? (roomNameToId.get(mtg.room) ?? null) : null
                const attendeeConnects = (mtg.attendees ?? [])
                    .map((email: string) => emailToAttendeeId.get(email))
                    .filter(Boolean)
                    .map((id: string) => ({ id }))

                const existing = await prisma.meeting.findFirst({
                    where: { title: mtg.title, date: mtg.date, startTime: mtg.startTime, eventId }
                })

                const commonFields = {
                    title: mtg.title, purpose: mtg.purpose ?? null,
                    date: mtg.date, startTime: mtg.startTime, endTime: mtg.endTime,
                    sequence: mtg.sequence ?? 0, status: mtg.status ?? 'PIPELINE',
                    tags: mtg.tags ?? [], meetingType: mtg.meetingType ?? null,
                    location: mtg.location ?? null, otherDetails: mtg.otherDetails ?? null,
                    isApproved: mtg.isApproved ?? false,
                    calendarInviteSent: mtg.calendarInviteSent ?? false,
                    createdBy: mtg.createdBy ?? null, requesterEmail: mtg.requesterEmail ?? null,
                    roomId, eventId,
                }

                if (existing) {
                    await prisma.meeting.update({
                        where: { id: existing.id },
                        data: { ...commonFields, attendees: { set: attendeeConnects } },
                    })
                } else {
                    await prisma.meeting.create({
                        data: { ...commonFields, attendees: { connect: attendeeConnects } },
                    })
                }
            } catch (e) {
                warnings.push(`Meeting '${mtg.title}': failed — ${(e as Error).message}`)
            }
        }
    }

    // 6. ROI Targets
    if (data.roiTargets) {
        try {
            const roi = data.roiTargets
            const targetCompanyConnect = await Promise.all(
                (roi.targetCompanyNames ?? []).map(async (name: string) => {
                    // Use in-memory map first to avoid redundant DB lookup
                    let id = companyNameToId.get(name)
                    if (!id) id = await resolveCompany(name)
                    return { id }
                })
            )

            const roiData = {
                expectedPipeline: roi.expectedPipeline ?? null,
                winRate: roi.winRate ?? null,
                expectedRevenue: roi.expectedRevenue ?? null,
                targetCustomerMeetings: roi.targetCustomerMeetings ?? null,
                targetErta: roi.targetErta ?? null,
                targetSpeaking: roi.targetSpeaking ?? null,
                targetMediaPR: roi.targetMediaPR ?? null,
                actualErta: roi.actualErta ?? null,
                actualSpeaking: roi.actualSpeaking ?? null,
                actualMediaPR: roi.actualMediaPR ?? null,
                status: roi.status ?? 'DRAFT',
                approvedBy: roi.approvedBy ?? null,
                approvedAt: roi.approvedAt ? new Date(roi.approvedAt) : null,
                submittedAt: roi.submittedAt ? new Date(roi.submittedAt) : null,
                rejectedBy: roi.rejectedBy ?? null,
                rejectedAt: roi.rejectedAt ? new Date(roi.rejectedAt) : null,
            }

            await prisma.eventROITargets.upsert({
                where: { eventId },
                create: { event: { connect: { id: eventId } }, ...roiData, targetCompanies: { connect: targetCompanyConnect } },
                update: { ...roiData, targetCompanies: { set: targetCompanyConnect } },
            })
        } catch (e) {
            warnings.push(`ROI targets: failed — ${(e as Error).message}`)
        }
    }

    // 7. Intelligence subscriptions
    if (data.intelligenceSubscriptions && Array.isArray(data.intelligenceSubscriptions)) {
        for (const s of data.intelligenceSubscriptions) {
            try {
                let sub = await prisma.intelligenceSubscription.findUnique({ where: { userId: s.userId } })
                if (!sub) {
                    sub = await prisma.intelligenceSubscription.create({
                        data: { userId: s.userId, email: s.email, active: s.active ?? true },
                    }).catch(() => null)
                }
                if (!sub) continue

                // Restore event selections
                await prisma.intelligenceSubEvent.upsert({
                    where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId } },
                    create: { subscriptionId: sub.id, eventId },
                    update: {},
                }).catch(() => { })

                // Restore attendee selections — resolve emails → IDs
                for (const email of (s.selectedAttendeeEmails ?? [])) {
                    const aid = emailToAttendeeId.get(email)
                    if (!aid) continue
                    await prisma.intelligenceSubAttendee.upsert({
                        where: { subscriptionId_attendeeId: { subscriptionId: sub.id, attendeeId: aid } },
                        create: { subscriptionId: sub.id, attendeeId: aid },
                        update: {},
                    }).catch(() => { })
                }

                // Restore company selections — resolve names → IDs
                for (const name of (s.selectedCompanyNames ?? [])) {
                    const cid = companyNameToId.get(name)
                    if (!cid) continue
                    await prisma.intelligenceSubCompany.upsert({
                        where: { subscriptionId_companyId: { subscriptionId: sub.id, companyId: cid } },
                        create: { subscriptionId: sub.id, companyId: cid },
                        update: {},
                    }).catch(() => { })
                }
            } catch (e) {
                warnings.push(`Intelligence sub for user '${s.userId}': failed — ${(e as Error).message}`)
            }
        }

        // Recompute subscriptionCounts
        for (const [, aid] of emailToAttendeeId) {
            const count = await prisma.intelligenceSubAttendee.count({ where: { attendeeId: aid } })
            await prisma.attendee.update({ where: { id: aid }, data: { subscriptionCount: count } }).catch(() => { })
        }
        const eventSubCount = await prisma.intelligenceSubEvent.count({ where: { eventId } })
        await prisma.event.update({ where: { id: eventId }, data: { subscriptionCount: eventSubCount } }).catch(() => { })
        for (const [, cid] of companyNameToId) {
            const count = await prisma.intelligenceSubCompany.count({ where: { companyId: cid } })
            await prisma.company.update({ where: { id: cid }, data: { subscriptionCount: count } }).catch(() => { })
        }
    }

    return { success: true, warnings }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/eusholli/dev/event-planner && npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/event.ts
git commit -m "feat: update importEventData to V5 — name/email-based upserts, authorizedEmails, warnings"
```

---

## Chunk 6: V5 Data Generator

### Task 7: Rewrite `process_data.py` for V5 + update tests

**Files:**
- Modify: `db-json/process_data.py`
- Modify: `db-json/test_process.py`

Produce `master-data-030926-v5.json` in canonical V5 system export format. Inputs: `master-data-030926-v4.json` (V4 custom format) and `mwc-final-031226.json` (single-event format).

- [ ] **Step 1: Rewrite `db-json/process_data.py`**

Replace the entire file:

```python
# db-json/process_data.py
"""
Generate master-data-030926-v5.json in V5 canonical system export format.

Inputs:
  - master-data-030926-v4.json  (V4 custom multi-event format)
  - mwc-final-031226.json       (single-event format, latest MWC BCN 2026 data)

Output:
  - master-data-030926-v5.json  (V5 system export format, name-based references)
"""
import json, os, sys, copy
from datetime import datetime, timezone

MASTER_FILE = "db-json/master-data-030926-v4.json"
MWC_FILE = "db-json/mwc-final-031226.json"
OUTPUT_FILE = "db-json/master-data-030926-v5.json"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Written: {path}")


def build_company_id_to_name(v4_data):
    """Return dict: companyId -> companyName from V4 companies list."""
    return {c["id"]: c["name"] for c in v4_data.get("companies", [])}


def convert_companies(v4_data):
    """Strip ids from companies; return list of {name, description, pipelineValue}."""
    return [
        {"name": c["name"], "description": c.get("description"), "pipelineValue": c.get("pipelineValue")}
        for c in v4_data.get("companies", [])
    ]


def convert_system_settings(v4_data):
    """Rename systemSettings key and return V5 system object."""
    ss = v4_data.get("systemSettings", {})
    return {
        "geminiApiKey": ss.get("geminiApiKey"),
        "defaultTags": ss.get("defaultTags", []),
        "defaultMeetingTypes": ss.get("defaultMeetingTypes", []),
        "defaultAttendeeTypes": ss.get("defaultAttendeeTypes", []),
    }


def convert_attendees(v4_data, company_id_to_name, mwc_src=None):
    """
    Convert V4 attendees to V5 format (companyId -> companyName, strip id).
    For attendees in mwc_src, use mwc_src data as source of truth (matched by email).
    New attendees in mwc_src not present in V4 are added to the result.
    """
    # Build email -> mwc attendee map (mwc-final is the authoritative source)
    mwc_by_email = {}
    if mwc_src:
        for a in mwc_src.get("attendees", []):
            mwc_by_email[a["email"]] = a

    result = []
    seen_emails = set()

    for att in v4_data.get("attendees", []):
        email = att["email"]
        seen_emails.add(email)
        company_name = company_id_to_name.get(att.get("companyId", ""), "")

        if email in mwc_by_email:
            src = mwc_by_email[email]
            # mwc-final uses 'company' string for company name
            company_name = src.get("company", "") or company_name
            result.append({
                "name": src.get("name", att.get("name", "")),
                "email": email,
                "title": src.get("title", att.get("title", "")),
                "bio": src.get("bio", att.get("bio", "")),
                "companyName": company_name,
                "linkedin": src.get("linkedin", att.get("linkedin", "")),
                "imageUrl": src.get("imageUrl", att.get("imageUrl", "")),
                "isExternal": src.get("isExternal", att.get("isExternal", False)),
                "type": src.get("type", att.get("type", "")),
                "seniorityLevel": att.get("seniorityLevel"),
            })
        else:
            result.append({
                "name": att.get("name", ""),
                "email": email,
                "title": att.get("title", ""),
                "bio": att.get("bio", ""),
                "companyName": company_name,
                "linkedin": att.get("linkedin", ""),
                "imageUrl": att.get("imageUrl", ""),
                "isExternal": att.get("isExternal", False),
                "type": att.get("type", ""),
                "seniorityLevel": att.get("seniorityLevel"),
            })

    # Add new attendees from mwc-final not present in V4
    for email, src in mwc_by_email.items():
        if email in seen_emails:
            continue
        company_name = src.get("company", "")
        result.append({
            "name": src.get("name", ""),
            "email": email,
            "title": src.get("title", ""),
            "bio": src.get("bio", ""),
            "companyName": company_name,
            "linkedin": src.get("linkedin", ""),
            "imageUrl": src.get("imageUrl", ""),
            "isExternal": src.get("isExternal", False),
            "type": src.get("type", ""),
            "seniorityLevel": None,
        })
        # Also ensure company is in companies list (add if new)
        if company_name and not any(c["name"] == company_name for c in v4_data.get("companies", [])):
            v4_data["companies"].append({
                "id": f"__new__{email}",
                "name": company_name,
                "description": src.get("companyDescription", ""),
                "pipelineValue": None,
            })
        print(f"  New attendee from mwc-final: {email} ({company_name})")

    return result


def convert_roi_targets(roi, company_id_to_name):
    """Strip internal ids from ROI targets; replace targetCompanyIds with targetCompanyNames."""
    if not roi:
        return None
    result = {k: v for k, v in roi.items()
              if k not in ("id", "eventId", "event", "targetCompanyIds", "targetCompanies")}
    # V4 stores targetCompanyIds as a list of UUIDs inside the ROI object
    target_ids = roi.get("targetCompanyIds", [])
    result["targetCompanyNames"] = [
        company_id_to_name[cid] for cid in target_ids if cid in company_id_to_name
    ]
    return result


def convert_events(v4_data, company_id_to_name):
    """
    Convert V4 events to V5 format.
    Strips id, authorizedUserIds (set authorizedEmails=[]).
    Rooms and meetings are NOT included here — they go to top-level lists.
    """
    result = []
    for e in v4_data.get("events", []):
        roi = convert_roi_targets(e.get("roiTargets"), company_id_to_name)
        event_out = {k: v for k, v in e.items()
                     if k not in ("id", "authorizedUserIds", "rooms", "meetings",
                                  "attendeeIds", "roiTargets")}
        event_out["authorizedEmails"] = []  # Cannot resolve offline without Clerk
        if roi is not None:
            event_out["roiTargets"] = roi
        result.append(event_out)
    return result


def build_rooms_for_event(event_name, rooms_src):
    """Convert room list (from mwc-final or V4 nested) to V5 top-level format."""
    result = []
    for r in rooms_src:
        result.append({
            "name": r["name"],
            "capacity": r.get("capacity", 0),
            "eventName": event_name,
        })
    return result


def build_meetings_for_event(event_name, meetings_src):
    """
    Convert meeting list from mwc-final (already email+name-based) to V5 top-level format.
    mwc-final meetings already have: room (name), attendees (emails).
    """
    result = []
    for m in meetings_src:
        mtg = {k: v for k, v in m.items() if k not in ("id", "eventId", "roomId")}
        mtg["eventName"] = event_name
        result.append(mtg)
    return result


def merge_mwc_into_v5_events(v5_events, mwc_src):
    """Update the MWC BCN 2026 event in v5_events list with metadata from mwc_src."""
    src_event = mwc_src.get("event", {})
    for e in v5_events:
        if e["name"] == "MWC BCN 2026":
            e["tags"] = src_event.get("tags", e.get("tags", []))
            e["meetingTypes"] = src_event.get("meetingTypes", e.get("meetingTypes", []))
            e["attendeeTypes"] = src_event.get("attendeeTypes", e.get("attendeeTypes", []))
            e["timezone"] = src_event.get("timezone") or e.get("timezone", "")
            e["boothLocation"] = src_event.get("boothLocation") or e.get("boothLocation", "")
            e["startDate"] = src_event.get("startDate", e.get("startDate"))
            e["endDate"] = src_event.get("endDate", e.get("endDate"))
            break
    return v5_events


def validate_v5(data):
    """Validate V5 output for referential integrity."""
    errors = []

    company_names = {c["name"] for c in data.get("companies", [])}
    event_names = {e["name"] for e in data.get("events", [])}
    attendee_emails = {a["email"] for a in data.get("attendees", [])}
    # Build set of (eventName, roomName) pairs for meeting→room checks
    room_keys = {(r.get("eventName", ""), r["name"]) for r in data.get("rooms", [])}

    # Check MWC present
    if "MWC BCN 2026" not in event_names:
        errors.append("MWC BCN 2026 event missing from output")

    # Check attendee company references
    for att in data.get("attendees", []):
        if att.get("companyName") and att["companyName"] not in company_names:
            errors.append(f"Attendee '{att['email']}': companyName '{att['companyName']}' not in companies")

    # Check room event references
    for room in data.get("rooms", []):
        if room.get("eventName") and room["eventName"] not in event_names:
            errors.append(f"Room '{room['name']}': eventName '{room['eventName']}' not in events")

    # Check meeting references (event, room, attendees)
    for mtg in data.get("meetings", []):
        event_name = mtg.get("eventName", "")
        if event_name and event_name not in event_names:
            errors.append(f"Meeting '{mtg['title']}': eventName '{event_name}' not in events")
        if mtg.get("room"):
            if (event_name, mtg["room"]) not in room_keys:
                errors.append(f"Meeting '{mtg['title']}': room '{mtg['room']}' not in rooms for event '{event_name}'")
        for email in mtg.get("attendees", []):
            if email not in attendee_emails:
                errors.append(f"Meeting '{mtg['title']}': attendee email '{email}' not in attendees")

    # Duplicate emails
    seen = set()
    for att in data.get("attendees", []):
        em = att["email"]
        if em in seen:
            errors.append(f"Duplicate email: {em}")
        seen.add(em)

    return errors


if __name__ == "__main__":
    print("Loading input files...")
    v4 = load_json(MASTER_FILE)
    mwc_src = load_json(MWC_FILE)
    print(f"V4: {len(v4['events'])} events, {len(v4['attendees'])} attendees, {len(v4['companies'])} companies")
    print(f"MWC source: {len(mwc_src.get('attendees', []))} attendees, "
          f"{len(mwc_src.get('meetings', []))} meetings, {len(mwc_src.get('rooms', []))} rooms")

    print("\nStep 1: Building lookup maps...")
    company_id_to_name = build_company_id_to_name(v4)

    print("Step 2: Converting system settings...")
    system_out = convert_system_settings(v4)

    print("Step 3: Converting events to V5 format...")
    events_out = convert_events(v4, company_id_to_name)

    print("Step 4: Merging MWC BCN 2026 metadata from source...")
    events_out = merge_mwc_into_v5_events(events_out, mwc_src)

    print("Step 5: Building MWC rooms and meetings from source...")
    mwc_rooms = build_rooms_for_event("MWC BCN 2026", mwc_src.get("rooms", []))
    mwc_meetings = build_meetings_for_event("MWC BCN 2026", mwc_src.get("meetings", []))

    print("Step 6: Converting attendees (MWC attendees from source, adds new attendees and companies)...")
    attendees_out = convert_attendees(v4, company_id_to_name, mwc_src)

    # Step 7 must run AFTER convert_attendees: new companies for new attendees may have been appended to v4["companies"]
    print("Step 7: Converting companies (includes any new ones added for new attendees)...")
    companies_out = convert_companies(v4)

    print("Step 8: Assembling V5 output...")
    v5 = {
        "version": "5.0",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "system": system_out,
        "companies": companies_out,
        "events": events_out,
        "attendees": attendees_out,
        "rooms": mwc_rooms,
        "meetings": mwc_meetings,
    }

    print("Step 9: Validating...")
    errors = validate_v5(v5)
    if errors:
        print(f"VALIDATION FAILED ({len(errors)} errors):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("Validation passed.")

    save_json(v5, OUTPUT_FILE)
    print(f"\nDone. {len(v5['events'])} events, {len(v5['attendees'])} attendees, "
          f"{len(v5['companies'])} companies, {len(v5['rooms'])} rooms, {len(v5['meetings'])} meetings")
```

- [ ] **Step 2: Update `db-json/test_process.py` for V5 format**

Replace the entire test file:

```python
# db-json/test_process.py
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import process_data as p


# --- Fixtures ---

def make_v4_master():
    return {
        "version": "6.0-intelligence-subscriptions",
        "exportedAt": "2026-03-09T00:00:00.000Z",
        "systemSettings": {
            "geminiApiKey": "key-123",
            "defaultTags": ["RAN"],
            "defaultMeetingTypes": ["Sales/Customer"],
            "defaultAttendeeTypes": ["Sales"],
        },
        "events": [{
            "id": "mwc-uuid",
            "name": "MWC BCN 2026",
            "startDate": "2026-03-02T00:00:00.000Z",
            "endDate": "2026-03-05T00:00:00.000Z",
            "slug": "mwc-bcn-2026",
            "status": "OCCURRED",
            "authorizedUserIds": ["user1"],
            "roiTargets": {
                "id": "roi1", "eventId": "mwc-uuid",
                "expectedPipeline": 1000000,
                "targetCompanyIds": ["old-co"],
            },
            "timezone": "CET", "boothLocation": "Hall 2",
            "url": "", "address": "", "region": "EU/UK", "budget": 0,
            "targetCustomers": "", "password": None, "description": "",
            "latitude": None, "longitude": None,
            "tags": ["Old"], "meetingTypes": ["Old"], "attendeeTypes": ["Old"],
            "rooms": [{"id": "old-room", "name": "Old Room", "capacity": 5, "eventId": "mwc-uuid"}],
            "meetings": [],
            "attendeeIds": ["old-att"],
        }],
        "attendees": [
            {"id": "old-att", "email": "old@old.com", "name": "Old Person",
             "title": "Dev", "bio": "", "companyId": "old-co",
             "linkedin": "", "imageUrl": "", "isExternal": False, "type": "Sales", "seniorityLevel": None},
        ],
        "companies": [
            {"id": "old-co", "name": "Old Co", "description": "Old desc", "pipelineValue": 0},
        ],
        "intelligenceSubscriptions": [],
    }


def make_mwc_source():
    return {
        "event": {
            "name": "MWC BCN 2026",
            "startDate": "2026-03-02T00:00:00.000Z",
            "endDate": "2026-03-05T00:00:00.000Z",
            "tags": ["Cloud"],
            "meetingTypes": ["Sales/Customer"],
            "attendeeTypes": ["Sales"],
            "timezone": "Europe/Madrid",
            "boothLocation": "Hall 2 Updated",
        },
        "rooms": [{"name": "Room A", "capacity": 10}],
        "attendees": [
            {"name": "Alice", "email": "alice@ext.com", "title": "CTO", "bio": "Bio",
             "company": "ExtCo", "companyDescription": "ExtCo desc",
             "linkedin": "li/alice", "imageUrl": "", "isExternal": True, "type": "Customer"},
            {"name": "Bob", "email": "bob@rakuten.com", "title": "Sales", "bio": "",
             "company": "Old Co", "companyDescription": "",
             "linkedin": "", "imageUrl": "", "isExternal": False, "type": "Sales"},
        ],
        "meetings": [
            {"title": "MTG Alice", "purpose": "Discuss", "date": "2026-03-03",
             "startTime": "10:00", "endTime": "11:00", "sequence": 1,
             "status": "OCCURRED", "tags": [], "createdBy": "bob@rakuten.com",
             "requesterEmail": "bob@rakuten.com", "meetingType": "Sales/Customer",
             "location": None, "otherDetails": None, "isApproved": True,
             "calendarInviteSent": False, "room": "Room A",
             "attendees": ["alice@ext.com", "bob@rakuten.com"]},
        ],
    }


# --- Unit tests ---

def test_convert_system_settings():
    v4 = make_v4_master()
    system = p.convert_system_settings(v4)
    assert system["geminiApiKey"] == "key-123"
    assert system["defaultTags"] == ["RAN"]
    assert system["defaultMeetingTypes"] == ["Sales/Customer"]
    assert system["defaultAttendeeTypes"] == ["Sales"]


def test_convert_companies_strips_id():
    v4 = make_v4_master()
    companies = p.convert_companies(v4)
    assert len(companies) == 1
    assert companies[0]["name"] == "Old Co"
    assert "id" not in companies[0]
    assert companies[0]["description"] == "Old desc"


def test_build_company_id_to_name():
    v4 = make_v4_master()
    mapping = p.build_company_id_to_name(v4)
    assert mapping["old-co"] == "Old Co"


def test_convert_events_strips_id_and_authorized_user_ids():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    events = p.convert_events(v4, cmap)
    assert len(events) == 1
    e = events[0]
    assert "id" not in e
    assert "authorizedUserIds" not in e
    assert e["authorizedEmails"] == []
    assert "rooms" not in e
    assert "meetings" not in e
    assert "attendeeIds" not in e


def test_convert_events_roi_targets_uses_company_names():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    events = p.convert_events(v4, cmap)
    roi = events[0]["roiTargets"]
    assert "id" not in roi
    assert "eventId" not in roi
    assert roi["targetCompanyNames"] == ["Old Co"]
    assert "targetCompanyIds" not in roi


def test_convert_attendees_uses_company_name():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    attendees = p.convert_attendees(v4, cmap)
    assert len(attendees) == 1
    att = attendees[0]
    assert att["companyName"] == "Old Co"
    assert "companyId" not in att
    assert "id" not in att


def test_convert_attendees_merges_mwc_source():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    mwc_src = make_mwc_source()

    # Add alice to V4 attendees (even though she's not there originally — simulate overlap)
    v4["attendees"].append({
        "id": "alice-id", "email": "alice@ext.com", "name": "Alice Old",
        "title": "Old Title", "bio": "", "companyId": "old-co",
        "linkedin": "", "imageUrl": "", "isExternal": False, "type": "Old", "seniorityLevel": None,
    })
    cmap = p.build_company_id_to_name(v4)
    attendees = p.convert_attendees(v4, cmap, mwc_src)

    alice = next(a for a in attendees if a["email"] == "alice@ext.com")
    assert alice["name"] == "Alice"  # updated from mwc_src
    assert alice["title"] == "CTO"
    assert alice["companyName"] == "ExtCo"  # from mwc_src company field


def test_merge_mwc_updates_metadata():
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    events = p.convert_events(v4, cmap)
    mwc_src = make_mwc_source()
    events = p.merge_mwc_into_v5_events(events, mwc_src)
    mwc = next(e for e in events if e["name"] == "MWC BCN 2026")
    assert mwc["tags"] == ["Cloud"]
    assert mwc["timezone"] == "Europe/Madrid"
    assert mwc["boothLocation"] == "Hall 2 Updated"


def test_build_rooms_for_event():
    rooms = p.build_rooms_for_event("MWC BCN 2026", [{"name": "Room A", "capacity": 10}])
    assert rooms[0]["eventName"] == "MWC BCN 2026"
    assert rooms[0]["name"] == "Room A"
    assert "id" not in rooms[0]


def test_build_meetings_for_event():
    mwc_src = make_mwc_source()
    meetings = p.build_meetings_for_event("MWC BCN 2026", mwc_src["meetings"])
    assert len(meetings) == 1
    mtg = meetings[0]
    assert mtg["eventName"] == "MWC BCN 2026"
    assert mtg["room"] == "Room A"
    assert "alice@ext.com" in mtg["attendees"]
    assert "id" not in mtg
    assert "eventId" not in mtg
    assert "roomId" not in mtg


def test_validate_v5_passes_clean_data():
    v5 = {
        "companies": [{"name": "Acme"}],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [{"email": "a@b.com", "companyName": "Acme"}],
        "rooms": [{"name": "Room A", "eventName": "MWC BCN 2026"}],
        "meetings": [{"title": "MTG", "eventName": "MWC BCN 2026", "attendees": ["a@b.com"]}],
    }
    errors = p.validate_v5(v5)
    assert errors == []


def test_validate_v5_catches_missing_company_name():
    v5 = {
        "companies": [],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [{"email": "a@b.com", "companyName": "Missing Co"}],
        "rooms": [],
        "meetings": [],
    }
    errors = p.validate_v5(v5)
    assert any("Missing Co" in e for e in errors)


def test_validate_v5_catches_missing_event_name_in_meeting():
    v5 = {
        "companies": [],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [],
        "rooms": [],
        "meetings": [{"title": "MTG", "eventName": "Unknown Event", "attendees": []}],
    }
    errors = p.validate_v5(v5)
    assert any("Unknown Event" in e for e in errors)


def test_validate_v5_catches_duplicate_emails():
    v5 = {
        "companies": [{"name": "Acme"}],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [
            {"email": "same@x.com", "companyName": "Acme"},
            {"email": "same@x.com", "companyName": "Acme"},
        ],
        "rooms": [],
        "meetings": [],
    }
    errors = p.validate_v5(v5)
    assert any("duplicate" in e.lower() for e in errors)


def test_validate_v5_catches_missing_mwc():
    v5 = {
        "companies": [],
        "events": [{"name": "Other Event"}],
        "attendees": [],
        "rooms": [],
        "meetings": [],
    }
    errors = p.validate_v5(v5)
    assert any("MWC BCN 2026" in e for e in errors)


def test_validate_v5_catches_bad_room_reference():
    v5 = {
        "companies": [{"name": "Acme"}],
        "events": [{"name": "MWC BCN 2026"}],
        "attendees": [{"email": "a@b.com", "companyName": "Acme"}],
        "rooms": [{"name": "Room A", "eventName": "MWC BCN 2026"}],
        "meetings": [{"title": "MTG", "eventName": "MWC BCN 2026",
                      "room": "Room B",  # does not exist
                      "attendees": ["a@b.com"]}],
    }
    errors = p.validate_v5(v5)
    assert any("Room B" in e for e in errors)


def test_convert_attendees_adds_new_mwc_attendees():
    """New attendees in mwc-final not in V4 must be added to the output."""
    v4 = make_v4_master()
    cmap = p.build_company_id_to_name(v4)
    mwc_src = make_mwc_source()
    # Alice and Bob are in mwc_src but NOT in v4 attendees
    attendees = p.convert_attendees(v4, cmap, mwc_src)
    emails = [a["email"] for a in attendees]
    assert "alice@ext.com" in emails
    assert "bob@rakuten.com" in emails
    # old@old.com is in V4 but not in mwc_src — should still be included
    assert "old@old.com" in emails
```

- [ ] **Step 3: Run the tests to verify they pass**

```bash
cd /Users/eusholli/dev/event-planner && python3 -m pytest db-json/test_process.py -v
```

Expected: all tests pass.

- [ ] **Step 4: Run the V5 generator**

```bash
cd /Users/eusholli/dev/event-planner && python3 db-json/process_data.py
```

Expected: output like:
```
V4: 57 events, 274 attendees, 143 companies
MWC source: 274 attendees, 321 meetings, 6 rooms
...
Validation passed.
Written: db-json/master-data-030926-v5.json
Done. 57 events, 274 attendees, 143 companies, 6 rooms, 321 meetings
```

- [ ] **Step 5: Spot-check the V5 output**

```bash
python3 -c "
import json
with open('db-json/master-data-030926-v5.json') as f:
    v5 = json.load(f)
print('version:', v5['version'])
print('keys:', list(v5.keys()))
print('events count:', len(v5['events']))
print('attendees count:', len(v5['attendees']))
print('companies count:', len(v5['companies']))
print('rooms count:', len(v5['rooms']))
print('meetings count:', len(v5['meetings']))
att = v5['attendees'][0]
print('attendee[0] has companyName:', 'companyName' in att)
print('attendee[0] has companyId:', 'companyId' in att)
print('attendee[0] has id:', 'id' in att)
room = v5['rooms'][0]
print('room[0] has eventName:', 'eventName' in room)
mtg = v5['meetings'][0]
print('meeting[0] has eventName:', 'eventName' in mtg)
print('meeting[0] attendees are emails:', all(\"@\" in a for a in mtg['attendees']))
mwc = next(e for e in v5['events'] if e['name'] == 'MWC BCN 2026')
print('MWC has authorizedEmails:', 'authorizedEmails' in mwc)
print('MWC has authorizedUserIds:', 'authorizedUserIds' in mwc)
"
```

Expected: `version: 5.0`, `companyName` present on attendees, `eventName` on rooms/meetings, attendee emails valid.

- [ ] **Step 6: Commit**

```bash
git add db-json/process_data.py db-json/test_process.py db-json/master-data-030926-v5.json
git commit -m "feat: generate master-data-030926-v5.json in V5 canonical format"
```

---

## Final Verification

- [ ] **Full build check**

```bash
cd /Users/eusholli/dev/event-planner && npm run build
```

Expected: exits 0.

- [ ] **All Python tests pass**

```bash
cd /Users/eusholli/dev/event-planner && python3 -m pytest db-json/test_process.py -v
```

Expected: all green.

- [ ] **Final commit tag**

```bash
git tag v5-export-import
```
