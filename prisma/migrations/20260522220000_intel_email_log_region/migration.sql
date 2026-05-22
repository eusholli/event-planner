-- AlterTable
ALTER TABLE "IntelligenceEmailLog" ADD COLUMN "region" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceEmailLog_runId_userId_status_region_key" ON "IntelligenceEmailLog"("runId", "userId", "status", "region");
