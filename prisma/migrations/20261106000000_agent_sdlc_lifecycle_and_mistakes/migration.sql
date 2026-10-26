-- AlterEnum
ALTER TYPE "AgentLevel" ADD VALUE 'admin_merger';

-- AlterTable
ALTER TABLE "Bug" ADD COLUMN "reviewStatus" TEXT;

-- CreateEnum
CREATE TYPE "MistakeCategory" AS ENUM ('correctness', 'efficiency', 'completeness', 'mergeability', 'architecture', 'security');

-- CreateTable
CREATE TABLE "AgentMistake" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bugId" TEXT,
    "mergerAgentId" TEXT NOT NULL,
    "category" "MistakeCategory" NOT NULL DEFAULT 'correctness',
    "title" TEXT NOT NULL,
    "antiPattern" TEXT NOT NULL,
    "remediation" TEXT NOT NULL,
    "badCodeSnippet" TEXT,
    "goodCodeSnippet" TEXT,
    "recurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMistake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentMistake_projectId_category_idx" ON "AgentMistake"("projectId", "category");

-- CreateIndex
CREATE INDEX "AgentMistake_tenantId_projectId_idx" ON "AgentMistake"("tenantId", "projectId");

-- AddForeignKey
ALTER TABLE "AgentMistake" ADD CONSTRAINT "AgentMistake_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMistake" ADD CONSTRAINT "AgentMistake_mergerAgentId_fkey" FOREIGN KEY ("mergerAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMistake" ADD CONSTRAINT "AgentMistake_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE SET NULL ON UPDATE CASCADE;
