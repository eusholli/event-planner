-- CreateTable
CREATE TABLE "EventMarketingChecklist" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventRecommendation" BOOLEAN NOT NULL DEFAULT false,
    "eventROICompleted" BOOLEAN NOT NULL DEFAULT false,
    "approval" BOOLEAN NOT NULL DEFAULT false,
    "eventPlanning" BOOLEAN NOT NULL DEFAULT false,
    "campaignPlanning" BOOLEAN NOT NULL DEFAULT false,
    "campaignActivation" BOOLEAN NOT NULL DEFAULT false,
    "campaignEvaluation" BOOLEAN NOT NULL DEFAULT false,
    "marketingTracker" BOOLEAN NOT NULL DEFAULT false,
    "liveCoverage" BOOLEAN NOT NULL DEFAULT false,
    "leadManagement" BOOLEAN NOT NULL DEFAULT false,
    "eventDataCapture" BOOLEAN NOT NULL DEFAULT false,
    "eventWrapUp" BOOLEAN NOT NULL DEFAULT false,
    "contentAmplification" BOOLEAN NOT NULL DEFAULT false,
    "crmUpdate" BOOLEAN NOT NULL DEFAULT false,
    "reportingActivations" BOOLEAN NOT NULL DEFAULT false,
    "eventCompleted" BOOLEAN NOT NULL DEFAULT false,
    "finalReport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMarketingChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventMarketingChecklist_eventId_key" ON "EventMarketingChecklist"("eventId");

-- AddForeignKey
ALTER TABLE "EventMarketingChecklist" ADD CONSTRAINT "EventMarketingChecklist_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
