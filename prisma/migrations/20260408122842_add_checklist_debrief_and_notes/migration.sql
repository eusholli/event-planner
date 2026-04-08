-- AlterTable
ALTER TABLE "EventMarketingChecklist" ADD COLUMN     "debriefOnTeamMeeting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" JSONB;
