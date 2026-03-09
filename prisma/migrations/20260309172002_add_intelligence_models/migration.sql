-- CreateTable
CREATE TABLE "IntelligenceSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntelligenceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceReport" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "salesAngle" TEXT NOT NULL,
    "fullReport" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceEmailLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "IntelligenceEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceSubscription_userId_key" ON "IntelligenceSubscription"("userId");

-- CreateIndex
CREATE INDEX "IntelligenceReport_runId_idx" ON "IntelligenceReport"("runId");

-- CreateIndex
CREATE INDEX "IntelligenceReport_targetName_idx" ON "IntelligenceReport"("targetName");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceReport_runId_targetName_key" ON "IntelligenceReport"("runId", "targetName");

-- CreateIndex
CREATE INDEX "IntelligenceEmailLog_runId_userId_idx" ON "IntelligenceEmailLog"("runId", "userId");
