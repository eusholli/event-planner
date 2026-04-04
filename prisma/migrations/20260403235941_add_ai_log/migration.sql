-- CreateTable
CREATE TABLE "AILog" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "functionName" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AILog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AILog_userEmail_idx" ON "AILog"("userEmail");

-- CreateIndex
CREATE INDEX "AILog_functionName_idx" ON "AILog"("functionName");
