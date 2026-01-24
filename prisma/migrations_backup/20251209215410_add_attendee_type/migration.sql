-- AlterTable
ALTER TABLE "Attendee" ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "EventSettings" ADD COLUMN     "attendeeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
