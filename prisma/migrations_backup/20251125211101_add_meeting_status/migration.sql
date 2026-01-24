-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('STARTED', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "status" "MeetingStatus" NOT NULL DEFAULT 'STARTED';
