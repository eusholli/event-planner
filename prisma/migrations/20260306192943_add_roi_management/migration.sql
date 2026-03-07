/*
  Warnings:

  - You are about to drop the column `expectedRoi` on the `Event` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Attendee" ADD COLUMN     "pipelineValue" DOUBLE PRECISION,
ADD COLUMN     "seniorityLevel" TEXT;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "expectedRoi";

-- CreateTable
CREATE TABLE "EventROITargets" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "targetInvestment" DOUBLE PRECISION,
    "expectedPipeline" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "expectedRevenue" DOUBLE PRECISION,
    "targetBoothMeetings" INTEGER,
    "targetCLevelMeetingsMin" INTEGER,
    "targetCLevelMeetingsMax" INTEGER,
    "targetOtherMeetings" INTEGER,
    "targetSocialReach" INTEGER,
    "targetKeynotes" INTEGER,
    "targetSeminars" INTEGER,
    "targetMediaPR" INTEGER,
    "targetBoothSessions" INTEGER,
    "targetCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actualSocialReach" INTEGER,
    "actualKeynotes" INTEGER,
    "actualSeminars" INTEGER,
    "actualMediaPR" INTEGER,
    "actualBoothSessions" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventROITargets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventROITargets_eventId_key" ON "EventROITargets"("eventId");

-- AddForeignKey
ALTER TABLE "EventROITargets" ADD CONSTRAINT "EventROITargets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
