-- AlterTable
ALTER TABLE "EventSettings" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
