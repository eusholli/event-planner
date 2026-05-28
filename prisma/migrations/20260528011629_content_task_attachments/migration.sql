-- AlterTable
ALTER TABLE "ContentTask" ADD COLUMN     "collaboratorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "ContentTaskAttachment" (
    "id" TEXT NOT NULL,
    "contentTaskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentTaskAttachment_contentTaskId_idx" ON "ContentTaskAttachment"("contentTaskId");

-- AddForeignKey
ALTER TABLE "ContentTaskAttachment" ADD CONSTRAINT "ContentTaskAttachment_contentTaskId_fkey" FOREIGN KEY ("contentTaskId") REFERENCES "ContentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
