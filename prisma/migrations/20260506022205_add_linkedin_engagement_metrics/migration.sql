-- AlterTable
ALTER TABLE "LinkedInDraft" ADD COLUMN     "activeUsers" INTEGER,
ADD COLUMN     "avgEngagementTimePerActiveUser" DOUBLE PRECISION,
ADD COLUMN     "budget" DOUBLE PRECISION,
ADD COLUMN     "viewsPerUser" DOUBLE PRECISION;
