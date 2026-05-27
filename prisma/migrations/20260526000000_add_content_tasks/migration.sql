-- CreateEnum
CREATE TYPE "ContentTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELED');

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN "defaultContentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ContentTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contentType" TEXT,
    "status" "ContentTaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assigneeId" TEXT,
    "eventId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentTask_eventId_idx" ON "ContentTask"("eventId");

-- CreateIndex
CREATE INDEX "ContentTask_assigneeId_idx" ON "ContentTask"("assigneeId");

-- CreateIndex
CREATE INDEX "ContentTask_status_idx" ON "ContentTask"("status");

-- CreateIndex
CREATE INDEX "ContentTask_dueDate_idx" ON "ContentTask"("dueDate");

-- AddForeignKey
ALTER TABLE "ContentTask" ADD CONSTRAINT "ContentTask_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
