/*
  Warnings:

  - You are about to drop the column `actualBoothSessions` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `actualKeynotes` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `actualSeminars` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `actualSocialReach` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetBoothMeetings` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetBoothSessions` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetCLevelMeetingsMax` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetCLevelMeetingsMin` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetInvestment` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetKeynotes` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetOtherMeetings` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetSeminars` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetSocialReach` on the `EventROITargets` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EventROITargets" DROP COLUMN "actualBoothSessions",
DROP COLUMN "actualKeynotes",
DROP COLUMN "actualSeminars",
DROP COLUMN "actualSocialReach",
DROP COLUMN "targetBoothMeetings",
DROP COLUMN "targetBoothSessions",
DROP COLUMN "targetCLevelMeetingsMax",
DROP COLUMN "targetCLevelMeetingsMin",
DROP COLUMN "targetInvestment",
DROP COLUMN "targetKeynotes",
DROP COLUMN "targetOtherMeetings",
DROP COLUMN "targetSeminars",
DROP COLUMN "targetSocialReach",
ADD COLUMN     "actualSpeaking" INTEGER,
ADD COLUMN     "actualTargetedReach" INTEGER,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedBy" TEXT,
ADD COLUMN     "targetCustomerMeetings" INTEGER,
ADD COLUMN     "targetSpeaking" INTEGER,
ADD COLUMN     "targetTargetedReach" INTEGER;
