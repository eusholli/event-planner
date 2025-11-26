-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "calendarInviteSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingType" TEXT,
ADD COLUMN     "otherDetails" TEXT,
ADD COLUMN     "requesterEmail" TEXT;
