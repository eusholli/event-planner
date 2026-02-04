/*
  Warnings:

  - You are about to drop the column `eventId` on the `Attendee` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Attendee" DROP CONSTRAINT "Attendee_eventId_fkey";

-- DropIndex
DROP INDEX "Attendee_email_eventId_key";

-- AlterTable
ALTER TABLE "Attendee" DROP COLUMN "eventId";

-- CreateTable
CREATE TABLE "_AttendeeToEvent" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AttendeeToEvent_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AttendeeToEvent_B_index" ON "_AttendeeToEvent"("B");

-- AddForeignKey
ALTER TABLE "_AttendeeToEvent" ADD CONSTRAINT "_AttendeeToEvent_A_fkey" FOREIGN KEY ("A") REFERENCES "Attendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttendeeToEvent" ADD CONSTRAINT "_AttendeeToEvent_B_fkey" FOREIGN KEY ("B") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
