-- Reset pitch data; the system-wide pitch model shipped briefly and is being replaced with a per-event model.
-- Pitch data is expendable at this stage; production has not relied on it.
UPDATE "Meeting" SET "pitchId" = NULL WHERE "pitchId" IS NOT NULL;
TRUNCATE TABLE "PitchAttendee" CASCADE;
TRUNCATE TABLE "Pitch" CASCADE;

-- Drop the M2M join table left over from the system-wide refactor
DROP TABLE IF EXISTS "_EventPitches";

-- Add the per-event scoping column and lineage column to Pitch
ALTER TABLE "Pitch" ADD COLUMN "eventId" TEXT NOT NULL;
ALTER TABLE "Pitch" ADD COLUMN "sourcePitchId" TEXT;

-- Foreign keys
ALTER TABLE "Pitch" ADD CONSTRAINT "Pitch_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pitch" ADD CONSTRAINT "Pitch_sourcePitchId_fkey"
  FOREIGN KEY ("sourcePitchId") REFERENCES "Pitch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Pitch_eventId_idx" ON "Pitch"("eventId");
CREATE INDEX "Pitch_sourcePitchId_idx" ON "Pitch"("sourcePitchId");
