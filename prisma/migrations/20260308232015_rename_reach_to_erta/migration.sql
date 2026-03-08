/*
  Warnings:

  - You are about to drop the column `actualTargetedReach` on the `EventROITargets` table. All the data in the column will be lost.
  - You are about to drop the column `targetTargetedReach` on the `EventROITargets` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EventROITargets" DROP COLUMN "actualTargetedReach",
DROP COLUMN "targetTargetedReach",
ADD COLUMN     "actualErta" DOUBLE PRECISION,
ADD COLUMN     "targetErta" DOUBLE PRECISION;
