-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "defaultRegionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
