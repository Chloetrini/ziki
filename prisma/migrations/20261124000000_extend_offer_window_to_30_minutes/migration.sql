-- #647: extend default claim offer TTL from 60 seconds to 30 minutes (1800 seconds).
ALTER TABLE "ProjectWorkflow" DROP CONSTRAINT IF EXISTS "ProjectWorkflow_offerWindowSeconds_check";
ALTER TABLE "ProjectWorkflow" ADD CONSTRAINT "ProjectWorkflow_offerWindowSeconds_check" CHECK ("offerWindowSeconds" BETWEEN 30 AND 3600);
ALTER TABLE "ProjectWorkflow" ALTER COLUMN "offerWindowSeconds" SET DEFAULT 1800;

-- Update existing rows where offerWindowSeconds was at the old default of 60 seconds
UPDATE "ProjectWorkflow" SET "offerWindowSeconds" = 1800 WHERE "offerWindowSeconds" = 60;
