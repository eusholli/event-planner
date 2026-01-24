-- Migration: Update EventSettings dates to date-only (midnight UTC)
-- This migration truncates existing DateTime values to date-only by setting them to midnight UTC
-- Run this on your production database to ensure consistency with the new date-only approach

-- Update all EventSettings records to set startDate and endDate to midnight UTC
-- This preserves the date portion while removing the time component
UPDATE "EventSettings"
SET 
    "startDate" = DATE_TRUNC('day', "startDate"),
    "endDate" = DATE_TRUNC('day', "endDate");

-- Verify the migration
-- You can run this query to check the results:
-- SELECT id, name, "startDate", "endDate" FROM "EventSettings";
