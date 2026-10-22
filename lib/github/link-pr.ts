import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/agent-api/events";
import { createReviewOffers } from "@/lib/agent-api/review-offer";
import { audit } from "@/lib/agents/audit";

/**
 * Record a pull request link on an issue (#452 / #474): set the URL and head
 * SHA, write the activity entry, publish `issue.pr_linked`, audit it when an
 * agent did it, and offer the fix to reviewers. Shared by the agent-facing
 * `POST /api/v1/issues/{id}/github` route and the GitHub webhook, which
 * auto-links a pull request that names the issue.
 *
 * Callers decide whether linking is allowed (claim held, repo matches,
 * acceptance binding); this only performs the write.
 */
export async function linkPullRequest(params: {
  bugId: string;
  tenantId: string;
  projectId: string;
  pullRequestUrl: string;
  pullRequestHeadSha: string | null;
  /** The claiming agent, or null when GitHub itself triggered the link. */
  actorAgentId: string | null;
  /** The person shown on the activity entry. */
  actorUserId: string;
  /** Marks how the link happened, e.g. `github_pull_request_opened`. */
  via?: string;
  db?: PrismaClient;
}): Promise<void> {
  const db = params.db ?? prisma;
  const { bugId, tenantId, projectId, pullRequestUrl, pullRequestHeadSha } = params;

  await db.$transaction(async (tx) => {
    await tx.bug.update({
      where: { id: bugId },
      data: { pullRequestUrl, pullRequestHeadSha },
    });

    await tx.bugActivity.create({
      data: {
        bugId,
        actorId: params.actorUserId,
        type: "edited",
        summary: `linked PR ${pullRequestUrl}`,
        metadata: {
          field: "pullRequestUrl",
          pullRequestUrl,
          ...(params.via ? { via: params.via } : {}),
        },
      },
    });

    await publish(tx, {
      tenantId,
      type: "issue.pr_linked",
      payload: {
        issueId: bugId,
        projectId,
        pullRequestUrl,
        agentId: params.actorAgentId,
      },
      actorAgentId: params.actorAgentId,
      bugId,
    });

    if (params.actorAgentId) {
      await audit(
        { agentId: params.actorAgentId, tenantId },
        "github.linked",
        `bug:${bugId}`,
        { pullRequestUrl, pullRequestHeadSha },
        { db: tx, bugId },
      );
    }
  });

  await createReviewOffers(
    db,
    { agentId: params.actorAgentId ?? undefined, tenantId },
    bugId,
    { pullRequestUrl, headSha: pullRequestHeadSha },
  ).catch(() => null);
}
