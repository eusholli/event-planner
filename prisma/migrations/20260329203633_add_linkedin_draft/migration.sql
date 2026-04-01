-- CreateTable
CREATE TABLE "LinkedInDraft" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "companyIds" TEXT[],
    "companyNames" TEXT[],
    "content" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datePosted" TIMESTAMP(3),
    "postUrl" TEXT,
    "impressions" INTEGER,
    "uniqueViews" INTEGER,
    "clicks" INTEGER,
    "reactions" INTEGER,
    "comments" INTEGER,
    "reposts" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "followsGained" INTEGER,
    "profileVisits" INTEGER,

    CONSTRAINT "LinkedInDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkedInDraft_eventId_idx" ON "LinkedInDraft"("eventId");

-- CreateIndex
CREATE INDEX "LinkedInDraft_createdBy_idx" ON "LinkedInDraft"("createdBy");

-- AddForeignKey
ALTER TABLE "LinkedInDraft" ADD CONSTRAINT "LinkedInDraft_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
