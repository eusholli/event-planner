-- CreateTable
CREATE TABLE "MarketingStrategy" (
    "id" TEXT NOT NULL,
    "themes" JSONB NOT NULL DEFAULT '[]',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignProposal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "proposalContent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "eventId" TEXT,
    "createdBy" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "activatedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "reusedAssets" JSONB,
    "suggestedContentTasks" JSONB,
    "suggestedLinkedInArticles" JSONB,
    "generatedContentTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedLinkedInDraftIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignProposal_status_idx" ON "CampaignProposal"("status");

-- CreateIndex
CREATE INDEX "CampaignProposal_eventId_idx" ON "CampaignProposal"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignProposal_runId_theme_key" ON "CampaignProposal"("runId", "theme");

-- AddForeignKey
ALTER TABLE "CampaignProposal" ADD CONSTRAINT "CampaignProposal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
