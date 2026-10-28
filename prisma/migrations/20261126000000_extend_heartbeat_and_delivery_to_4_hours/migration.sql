-- Extend default heartbeat window and delivery deadline from 15 minutes to 4 hours (240 minutes)
ALTER TABLE "ProjectWorkflow" ALTER COLUMN "heartbeatMinutes" SET DEFAULT 240;
ALTER TABLE "ProjectWorkflow" ALTER COLUMN "deliveryMinutes" SET DEFAULT 240;

-- Update existing rows where heartbeatMinutes / deliveryMinutes were at the old default of 15 minutes
UPDATE "ProjectWorkflow" SET "heartbeatMinutes" = 240 WHERE "heartbeatMinutes" <= 15;
UPDATE "ProjectWorkflow" SET "deliveryMinutes" = 240 WHERE "deliveryMinutes" <= 15;
