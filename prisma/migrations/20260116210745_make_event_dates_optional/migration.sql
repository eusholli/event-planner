-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "startDate" DROP NOT NULL,
ALTER COLUMN "startDate" DROP DEFAULT,
ALTER COLUMN "endDate" DROP NOT NULL,
ALTER COLUMN "endDate" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "defaultAttendeeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defaultMeetingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defaultTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
