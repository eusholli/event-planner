-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "boothLocation" TEXT;

-- AlterTable
ALTER TABLE "_AttendeeMeetings" ADD CONSTRAINT "_AttendeeMeetings_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_AttendeeMeetings_AB_unique";
