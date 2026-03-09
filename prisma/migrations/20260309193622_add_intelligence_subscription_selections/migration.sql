-- AlterTable
ALTER TABLE "Attendee" ADD COLUMN     "subscriptionCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "subscriptionCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "subscriptionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "IntelligenceSubAttendee" (
    "subscriptionId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,

    CONSTRAINT "IntelligenceSubAttendee_pkey" PRIMARY KEY ("subscriptionId","attendeeId")
);

-- CreateTable
CREATE TABLE "IntelligenceSubCompany" (
    "subscriptionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "IntelligenceSubCompany_pkey" PRIMARY KEY ("subscriptionId","companyId")
);

-- CreateTable
CREATE TABLE "IntelligenceSubEvent" (
    "subscriptionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "IntelligenceSubEvent_pkey" PRIMARY KEY ("subscriptionId","eventId")
);

-- AddForeignKey
ALTER TABLE "IntelligenceSubAttendee" ADD CONSTRAINT "IntelligenceSubAttendee_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "IntelligenceSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceSubAttendee" ADD CONSTRAINT "IntelligenceSubAttendee_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceSubCompany" ADD CONSTRAINT "IntelligenceSubCompany_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "IntelligenceSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceSubCompany" ADD CONSTRAINT "IntelligenceSubCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceSubEvent" ADD CONSTRAINT "IntelligenceSubEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "IntelligenceSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceSubEvent" ADD CONSTRAINT "IntelligenceSubEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
