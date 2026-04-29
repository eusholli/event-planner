/*
  Warnings:

  - You are about to drop the column `comments` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `datePosted` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `engagementRate` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `followsGained` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `postUrl` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `profileVisits` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `reactions` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `reposts` on the `LinkedInDraft` table. All the data in the column will be lost.
  - You are about to drop the column `uniqueViews` on the `LinkedInDraft` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LinkedInDraft" DROP COLUMN "comments",
DROP COLUMN "datePosted",
DROP COLUMN "engagementRate",
DROP COLUMN "followsGained",
DROP COLUMN "postUrl",
DROP COLUMN "profileVisits",
DROP COLUMN "reactions",
DROP COLUMN "reposts",
DROP COLUMN "uniqueViews",
ADD COLUMN     "adEndDate" TIMESTAMP(3),
ADD COLUMN     "adStartDate" TIMESTAMP(3),
ADD COLUMN     "averageCpc" DOUBLE PRECISION,
ADD COLUMN     "averageCtr" DOUBLE PRECISION,
ADD COLUMN     "ctaUrl" TEXT,
ADD COLUMN     "topCompaniesByEngagement" TEXT;
