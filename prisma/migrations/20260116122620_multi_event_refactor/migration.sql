/*
  Warnings:
  - You are about to drop the `EventSettings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[email,eventId]` on the table `Attendee` will be added. If there are existing duplicate values, this will fail.
*/

-- 1. Create the new tables first
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "geminiApiKey" TEXT,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Event',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meetingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attendeeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT,
    "url" TEXT,
    "address" TEXT,
    "requesterEmail" TEXT,
    "region" TEXT,
    "budget" DOUBLE PRECISION,
    "targetCustomers" TEXT,
    "expectedRoi" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PIPELINE',

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- 2. Migrate Data from EventSettings to SystemSettings and Event

-- Insert into SystemSettings (taking the first row if multiple, though it should be singleton)
INSERT INTO "SystemSettings" ("id", "geminiApiKey")
SELECT gen_random_uuid(), "geminiApiKey"
FROM "EventSettings"
LIMIT 1;

-- Insert into Event (migrating the core event data)
-- We set status to 'COMMITTED' for the existing event so it's visible to users
INSERT INTO "Event" ("id", "name", "startDate", "endDate", "tags", "meetingTypes", "attendeeTypes", "timezone", "status")
SELECT "id", "name", "startDate", "endDate", "tags", "meetingTypes", "attendeeTypes", "timezone", 'COMMITTED'
FROM "EventSettings";

-- 3. Add Columns to other tables
ALTER TABLE "Attendee" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Room" ADD COLUMN "eventId" TEXT;

-- 4. Link existing data to the migrated Event
-- We update all existing records to point to the (single) Event we just migrated.
-- Since Event.id came from EventSettings.id, we can pick that ID.
DO $$
DECLARE
    migrated_event_id TEXT;
BEGIN
    SELECT "id" INTO migrated_event_id FROM "Event" LIMIT 1;
    
    IF migrated_event_id IS NOT NULL THEN
        UPDATE "Attendee" SET "eventId" = migrated_event_id WHERE "eventId" IS NULL;
        UPDATE "Meeting" SET "eventId" = migrated_event_id WHERE "eventId" IS NULL;
        UPDATE "Room" SET "eventId" = migrated_event_id WHERE "eventId" IS NULL;
    END IF;
END $$;

-- 5. Drop the old table
DROP TABLE "EventSettings";

-- 6. Add Constraints and Indexes

-- Index on Attendee
CREATE UNIQUE INDEX "Attendee_email_eventId_key" ON "Attendee"("email", "eventId");

-- Add Validation: Ensure eventId is NOT NULL for integrity (optional, but good practice if we successfully migrated)
-- We won't enforce NOT NULL immediately in case of empty DBs, but the application logic requires it.

-- Foreign Keys
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Room" ADD CONSTRAINT "Room_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
