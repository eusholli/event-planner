/*
  WARNING: This script will DROP the entire public schema and all data within it.
  It effectively resets the database to a clean state based on the current Prisma schema.
*/

-- 1. Drop and verify clean state
DROP SCHEMA IF EXISTS "public" CASCADE;
CREATE SCHEMA "public";

-- 2. Apply Prisma Schema
-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED');

-- CreateTable
CREATE TABLE "EventSettings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Event',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geminiApiKey" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meetingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attendeeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT,

    CONSTRAINT "EventSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bio" TEXT,
    "company" TEXT NOT NULL,
    "companyDescription" TEXT,
    "linkedin" TEXT,
    "imageUrl" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT,

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "date" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "roomId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PIPELINE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "requesterEmail" TEXT,
    "meetingType" TEXT,
    "location" TEXT,
    "otherDetails" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "calendarInviteSent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AttendeeMeetings" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Attendee_email_key" ON "Attendee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "_AttendeeMeetings_AB_unique" ON "_AttendeeMeetings"("A", "B");

-- CreateIndex
CREATE INDEX "_AttendeeMeetings_B_index" ON "_AttendeeMeetings"("B");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttendeeMeetings" ADD CONSTRAINT "_AttendeeMeetings_A_fkey" FOREIGN KEY ("A") REFERENCES "Attendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttendeeMeetings" ADD CONSTRAINT "_AttendeeMeetings_B_fkey" FOREIGN KEY ("B") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
