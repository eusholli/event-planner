---
name: sync-schema-exports
description: Use when prisma/schema.prisma or any prisma/migrations file has been
  modified, or when import/export routes fail after a schema change. Audits all
  import/export surfaces against the current schema and fixes any misaligned fields,
  missing models, or broken relation references.
---

# Sync Schema Exports

Audit and repair all import/export surfaces after a Prisma schema change.

## Step 1 — Read the Schema

Read `prisma/schema.prisma` in full. For each model, list:
- All scalar fields (name, type, required/optional)
- All relation fields (many-to-one via FK, many-to-many via join)
- Any new models added since the last audit

## Step 2 — Identify Changed Models

Compare the schema against the 3 import/export surface pairs below. For each model that changed, record:
- **Added fields** — are they exported? are they imported with correct handling?
- **Removed fields** — are stale references still in export SELECT or import create/update?
- **Renamed fields** — are both old and new names handled in import?
- **Moved to new model** — does the new model have its own import/export section?
- **Changed relation type** — e.g. scalar FK → many-to-many join table

## Step 3 — Audit Each Surface

### Surface 1 — Basic Settings (incomplete/legacy)
| File | Role |
|------|------|
| `app/api/settings/export/route.ts` | Exports: SystemSettings, Events, Attendees, Rooms, Meetings |
| `app/api/settings/import/route.ts` | Imports same; does NOT include Company |

Audit checklist:
- Export: does each Prisma `findMany` / `findFirst` select all relevant fields?
- Import: does each `create` / `update` use the correct field names and relation syntax?
- Known pre-existing bug (should already be fixed): `settings/import` used `eventId` on
  `Attendee` which does not exist. Correct pattern: `events: { connect: { id: eventId } }`

### Surface 2 — Admin Full System (canonical)
| File | Role |
|------|------|
| `app/api/admin/system/export/route.ts` | Full export, all models, IDs normalised |
| `app/api/admin/system/import/route.ts` | Full import, backwards-compatible |

Audit checklist:
- Every model in schema has an export section
- Import uses upsert or create-if-not-exists
- Old field names still accepted (backwards compatibility pattern — see Step 4)
- Version string present

### Surface 3 — Event-Scoped
| File | Role |
|------|------|
| `app/api/events/[id]/export/route.ts` | Single event + related data |
| `app/api/events/[id]/import/route.ts` | Import into existing event |
| `lib/actions/event.ts` | `duplicateEvent` action (also copies data) |

Audit checklist:
- Export includes all event-scoped models (Companies, Attendees, Rooms, Meetings, ROITargets)
- Import resolves attendee many-to-many via `events: { connect: { id: eventId } }` not scalar FK
- `duplicateEvent` copies all fields present in the schema

## Step 4 — Backwards Compatibility Pattern

When a field is renamed or moved, import must accept both old and new formats.
Pattern used in `admin/system/import`:

```typescript
// Accept old name (fieldOld) or new name (fieldNew)
const resolvedValue = data.fieldNew ?? data.fieldOld ?? defaultValue
```

Never remove handling of old field names from import without a major version bump.

## Step 5 — Fix Priority Order

Apply fixes in this order:
1. **Admin full system** (`admin/system/import`, `admin/system/export`) — canonical, used for DR
2. **Event-scoped** (`events/[id]/import`, `events/[id]/export`, `lib/actions/event.ts`)
3. **Basic settings** (`settings/import`, `settings/export`) — legacy, lower priority

## Step 6 — Version String

If a breaking change is made (field removed, model removed, relation type changed), bump
the version string:
- `app/api/admin/system/export/route.ts` — look for `version:` in the export payload
- `lib/actions/event.ts` — look for `exportVersion` constant

Use semver-style: `1.0` → `1.1` for additive, `2.0` for breaking.

## Step 7 — Verification

```bash
npx tsc --noEmit          # type-check all surfaces
npm run build             # full build (catches runtime errors)
```

Fix any TypeScript errors before marking the audit complete.

---

## Quick Reference: Common Change Scenarios

| Schema change | Export action | Import action |
|---|---|---|
| Add optional field | Add to SELECT | Add to `create`/`update` data, default to `undefined` |
| Add required field | Add to SELECT | Add to `create` data; add backwards-compat default in import |
| Remove field | Remove from SELECT | Remove from `create`/`update`; keep old name as no-op for backwards compat |
| Rename field `old` → `new` | Use `new` in SELECT | Accept `data.new ?? data.old` |
| New model added | Add new export section | Add new import section with upsert |
| Scalar FK → many-to-many | Export related records as array | Use `{ connect: [{ id: ... }] }` not scalar field |
| Add enum value | No change needed | Validate enum value; default to safe value if unrecognised |

---

## Notes

- `Attendee` is system-level (unique by email), shared across events via many-to-many.
  Never pass `eventId` directly to `prisma.attendee.create()`.
- `Company` is system-level; referenced by `Attendee.companyId` (required FK).
  Import attendees AFTER companies so the FK can resolve.
- `Meeting.sequence` should be preserved on import (calendar invite versioning).
- Events with `status: OCCURRED` are read-only in the API — skip or warn on import conflict.

---

## Installation Note

The active copy Claude loads must be at `~/.claude/skills/sync-schema-exports/SKILL.md`.
This repo copy (`.claude/skills/sync-schema-exports/SKILL.md`) is the source of truth —
copy it to the user-level path on any new machine:

```bash
mkdir -p ~/.claude/skills/sync-schema-exports
cp .claude/skills/sync-schema-exports/SKILL.md ~/.claude/skills/sync-schema-exports/SKILL.md
```
