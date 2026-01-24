-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PIPELINE', 'CONFIRMED', 'OCCURRED', 'CANCELED');

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "geminiApiKey" TEXT,
    "defaultAttendeeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultMeetingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultTags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meetingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attendeeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorizedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT,
    "url" TEXT,
    "address" TEXT,
    "requesterEmail" TEXT,
    "region" TEXT,
    "budget" DOUBLE PRECISION,
    "targetCustomers" TEXT,
    "expectedRoi" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PIPELINE',
    "slug" TEXT NOT NULL,
    "password" TEXT,
    "description" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bio" TEXT,
    "company" TEXT NOT NULL,
    "companyDescription" TEXT,
    "linkedin" TEXT,
    "imageUrl" TEXT,
    "title" TEXT NOT NULL,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT,
    "eventId" TEXT,

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "eventId" TEXT,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "roomId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PIPELINE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "date" TEXT,
    "calendarInviteSent" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "meetingType" TEXT,
    "otherDetails" TEXT,
    "requesterEmail" TEXT,
    "location" TEXT,
    "eventId" TEXT,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AttendeeMeetings" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_name_key" ON "Event"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Attendee_email_key" ON "Attendee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Attendee_email_eventId_key" ON "Attendee"("email", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "_AttendeeMeetings_AB_unique" ON "_AttendeeMeetings"("A", "B");

-- CreateIndex
CREATE INDEX "_AttendeeMeetings_B_index" ON "_AttendeeMeetings"("B");

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttendeeMeetings" ADD CONSTRAINT "_AttendeeMeetings_A_fkey" FOREIGN KEY ("A") REFERENCES "Attendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttendeeMeetings" ADD CONSTRAINT "_AttendeeMeetings_B_fkey" FOREIGN KEY ("B") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

