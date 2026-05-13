-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "pitchId" TEXT;

-- CreateTable
CREATE TABLE "Pitch" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pitchText" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchAttendee" (
    "pitchId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "resultingUrls" TEXT,
    "additionalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchAttendee_pkey" PRIMARY KEY ("pitchId","attendeeId")
);

-- CreateIndex
CREATE INDEX "Pitch_eventId_idx" ON "Pitch"("eventId");

-- CreateIndex
CREATE INDEX "PitchAttendee_attendeeId_idx" ON "PitchAttendee"("attendeeId");

-- CreateIndex
CREATE INDEX "Meeting_pitchId_idx" ON "Meeting"("pitchId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_pitchId_fkey" FOREIGN KEY ("pitchId") REFERENCES "Pitch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pitch" ADD CONSTRAINT "Pitch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchAttendee" ADD CONSTRAINT "PitchAttendee_pitchId_fkey" FOREIGN KEY ("pitchId") REFERENCES "Pitch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchAttendee" ADD CONSTRAINT "PitchAttendee_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
