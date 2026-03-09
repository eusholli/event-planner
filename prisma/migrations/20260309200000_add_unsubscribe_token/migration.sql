-- Add unsubscribeToken as nullable first to handle existing rows
ALTER TABLE "IntelligenceSubscription" ADD COLUMN "unsubscribeToken" TEXT;

-- Populate existing rows with a unique cuid-style value
UPDATE "IntelligenceSubscription" SET "unsubscribeToken" = gen_random_uuid()::text WHERE "unsubscribeToken" IS NULL;

-- Now make it required and unique
ALTER TABLE "IntelligenceSubscription" ALTER COLUMN "unsubscribeToken" SET NOT NULL;
CREATE UNIQUE INDEX "IntelligenceSubscription_unsubscribeToken_key" ON "IntelligenceSubscription"("unsubscribeToken");
