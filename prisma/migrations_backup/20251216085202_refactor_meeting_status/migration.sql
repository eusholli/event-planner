/*
  Warnings:

  - The values [STARTED] on the enum `MeetingStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MeetingStatus_new" AS ENUM ('PIPELINE', 'COMMITTED', 'COMPLETED', 'CANCELED');
ALTER TABLE "Meeting" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Meeting" ALTER COLUMN "status" TYPE "MeetingStatus_new" USING (
  CASE
    WHEN "status"::text = 'STARTED' THEN 'PIPELINE'::"MeetingStatus_new"
    WHEN "status"::text = 'COMPLETED' THEN 'COMMITTED'::"MeetingStatus_new"
    ELSE "status"::text::"MeetingStatus_new"
  END
);
ALTER TYPE "MeetingStatus" RENAME TO "MeetingStatus_old";
ALTER TYPE "MeetingStatus_new" RENAME TO "MeetingStatus";
DROP TYPE "MeetingStatus_old";
ALTER TABLE "Meeting" ALTER COLUMN "status" SET DEFAULT 'PIPELINE';
COMMIT;

-- AlterTable
ALTER TABLE "Meeting" ALTER COLUMN "status" SET DEFAULT 'PIPELINE';
