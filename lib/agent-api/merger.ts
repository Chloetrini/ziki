import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { requireLevel } from "@/lib/agents/levels";
import { isConfirmed } from "@/lib/agent-api/validation";
import { reviewerConflict } from "@/lib/agents/independence";
import { workflowFor } from "@/lib/workflow";

export type ReadyToMergeIssue = {
  id: string;
  number: number;
  title: string;
  projectId: string;
  pullRequestUrl: string;
  pullRequestHeadSha: string | null;
  reviewStatus: string | null;
  claim: {
    agentId: string;
    beneficiaryUserId: string;
  } | null;
  verdictsCount: number;
  createdAt: Date;
};

/**
 * Scan for issues ready to be merged: confirmed, active claim, linked PR,
 * and sufficient independent goodToMerge test verdicts, with merger independence.
 */
export async function findReadyToMergeIssues(
  agent: AgentContext,
  projectId: string,
  limit = 50,
): Promise<ReadyToMergeIssue[]> {
  requireLevel(agent, "merger");
  const { verdictsNeeded } = await workflowFor(projectId);

  const candidates = await prisma.bug.findMany({
    where: {
      tenantId: agent.tenantId,
      projectId,
      isDeleted: false,
      status: { in: ["open", "in_progress"] },
      reviewStatus: { not: "rejected" },
      pullRequestUrl: { not: null },
      claims: {
        some: {
          status: "active",
          releasedAt: null,
        },
      },
    },
    take: limit * 2,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      number: true,
      title: true,
      projectId: true,
      pullRequestUrl: true,
      pullRequestHeadSha: true,
      reviewStatus: true,
      reporterId: true,
      beneficiaryUserId: true,
      createdByAgentId: true,
      createdAt: true,
      claims: {
        where: { status: "active", releasedAt: null },
        take: 1,
        select: {
          agentId: true,
          beneficiaryUserId: true,
          agent: { select: { ownerUserId: true } },
        },
      },
      testVerdicts: {
        where: { goodToMerge: true },
        select: {
          id: true,
          onBehalfOfUserId: true,
          pullRequestUrl: true,
          agent: { select: { id: true, ownerUserId: true } },
        },
      },
    },
  });

  const ready: ReadyToMergeIssue[] = [];
  for (const bug of candidates) {
    if (ready.length >= limit) break;
    if (!(await isConfirmed(bug.id))) continue;

    const claim = bug.claims[0];
    const owners = new Set<string>();
    for (const verdict of bug.testVerdicts) {
      if (bug.pullRequestUrl && verdict.pullRequestUrl !== bug.pullRequestUrl) continue;
      if (claim && (verdict.agent.id === claim.agentId || verdict.agent.ownerUserId === claim.agent.ownerUserId)) {
        continue;
      }
      if (owners.has(verdict.agent.ownerUserId)) continue;
      owners.add(verdict.agent.ownerUserId);
    }

    if (owners.size < verdictsNeeded) continue;

    const reviewed = {
      reporterId: bug.reporterId,
      beneficiaryUserId: bug.beneficiaryUserId,
      createdByAgentId: bug.createdByAgentId,
      claims: claim
        ? [
            {
              status: "active" as const,
              releasedAt: null,
              agentId: claim.agentId,
              beneficiaryUserId: claim.beneficiaryUserId,
              agent: claim.agent,
            },
          ]
        : [],
    };
    if (reviewerConflict({ id: agent.agentId, ownerUserId: agent.ownerId }, reviewed)) continue;

    ready.push({
      id: bug.id,
      number: bug.number,
      title: bug.title,
      projectId: bug.projectId,
      pullRequestUrl: bug.pullRequestUrl!,
      pullRequestHeadSha: bug.pullRequestHeadSha,
      reviewStatus: bug.reviewStatus,
      claim: claim ? { agentId: claim.agentId, beneficiaryUserId: claim.beneficiaryUserId } : null,
      verdictsCount: owners.size,
      createdAt: bug.createdAt,
    });
  }

  return ready;
}
