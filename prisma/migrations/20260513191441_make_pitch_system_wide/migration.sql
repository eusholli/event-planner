-- Step 1: Create the new M2M join table
CREATE TABLE "_EventPitches" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_EventPitches_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_EventPitches_B_index" ON "_EventPitches"("B");

ALTER TABLE "_EventPitches" ADD CONSTRAINT "_EventPitches_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_EventPitches" ADD CONSTRAINT "_EventPitches_B_fkey"
    FOREIGN KEY ("B") REFERENCES "Pitch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 2: Preserve existing pitch->event links into the new join
INSERT INTO "_EventPitches" ("A", "B")
SELECT "eventId", "id" FROM "Pitch";

-- Step 3: Rename updatedAt -> modified (preserves data) and drop old eventId
ALTER TABLE "Pitch" DROP CONSTRAINT "Pitch_eventId_fkey";
DROP INDEX "Pitch_eventId_idx";
ALTER TABLE "Pitch" RENAME COLUMN "updatedAt" TO "modified";
ALTER TABLE "Pitch" DROP COLUMN "eventId";
