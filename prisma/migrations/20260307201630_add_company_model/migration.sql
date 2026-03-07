/*
  Warnings:

  - You are about to drop the column `company` on the `Attendee` table. All the data in the column will be lost.
  - You are about to drop the column `companyDescription` on the `Attendee` table. All the data in the column will be lost.
  - You are about to drop the column `pipelineValue` on the `Attendee` table. All the data in the column will be lost.
  - You are about to drop the column `targetCompanies` on the `EventROITargets` table. All the data in the column will be lost.
  - Added the required column `companyId` to the `Attendee` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Attendee" DROP COLUMN "company",
DROP COLUMN "companyDescription",
DROP COLUMN "pipelineValue",
ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EventROITargets" DROP COLUMN "targetCompanies";

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pipelineValue" DOUBLE PRECISION,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TargetCompanies" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TargetCompanies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE INDEX "_TargetCompanies_B_index" ON "_TargetCompanies"("B");

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TargetCompanies" ADD CONSTRAINT "_TargetCompanies_A_fkey" FOREIGN KEY ("A") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TargetCompanies" ADD CONSTRAINT "_TargetCompanies_B_fkey" FOREIGN KEY ("B") REFERENCES "EventROITargets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
