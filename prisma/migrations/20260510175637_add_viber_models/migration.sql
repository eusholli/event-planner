-- CreateTable
CREATE TABLE "ViberLinkCode" (
    "code" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViberLinkCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ViberUser" (
    "viberUserId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "viberName" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViberUser_pkey" PRIMARY KEY ("viberUserId")
);

-- CreateIndex
CREATE INDEX "ViberLinkCode_clerkUserId_idx" ON "ViberLinkCode"("clerkUserId");

-- CreateIndex
CREATE INDEX "ViberLinkCode_expiresAt_idx" ON "ViberLinkCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ViberUser_clerkUserId_key" ON "ViberUser"("clerkUserId");
