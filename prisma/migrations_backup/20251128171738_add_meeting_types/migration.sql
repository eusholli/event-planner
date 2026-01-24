-- AlterTable
ALTER TABLE "EventSettings" ADD COLUMN     "meetingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
