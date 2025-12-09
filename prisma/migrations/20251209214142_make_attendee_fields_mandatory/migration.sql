/*
  Warnings:

  - Made the column `company` on table `Attendee` required. This step will fail if there are existing NULL values in that column.
  - Made the column `title` on table `Attendee` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Attendee" ALTER COLUMN "company" SET NOT NULL,
ALTER COLUMN "title" SET NOT NULL;
