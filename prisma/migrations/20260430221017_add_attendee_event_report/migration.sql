-- CreateTable
CREATE TABLE "AttendeeEventReport" (
    "eventId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "reportText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendeeEventReport_pkey" PRIMARY KEY ("eventId","attendeeId")
);

-- CreateIndex
CREATE INDEX "AttendeeEventReport_attendeeId_idx" ON "AttendeeEventReport"("attendeeId");

-- AddForeignKey
ALTER TABLE "AttendeeEventReport" ADD CONSTRAINT "AttendeeEventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeEventReport" ADD CONSTRAINT "AttendeeEventReport_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
