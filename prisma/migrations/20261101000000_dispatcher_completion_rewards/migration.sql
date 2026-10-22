ALTER TYPE "PointRole" ADD VALUE 'dispatcher';

ALTER TABLE "IssueClaim" ADD COLUMN "dispatcherUserId" TEXT;

CREATE INDEX "IssueClaim_dispatcherUserId_idx" ON "IssueClaim"("dispatcherUserId");

ALTER TABLE "IssueClaim" ADD CONSTRAINT "IssueClaim_dispatcherUserId_fkey" FOREIGN KEY ("dispatcherUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
