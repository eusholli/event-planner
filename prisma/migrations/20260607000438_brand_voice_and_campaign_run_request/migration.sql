-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "brandVoice" TEXT;

-- CreateTable
CREATE TABLE "CampaignRunRequest" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "runId" TEXT,
    "proposalId" TEXT,
    "error" TEXT,

    CONSTRAINT "CampaignRunRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignRunRequest_status_idx" ON "CampaignRunRequest"("status");
