import type { PrismaClient } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/require-agent";
import { publish } from "@/lib/agent-api/events";
import { commentedSummary, commentPreview } from "@/lib/activity-log";

/**
 * Merge statuses for a fix that is ready to merge but did not merge. They live
 * on `Bug.reviewStatus` next to `submitted`, `ready_to_merge`, `rejected` and
 * `merged`, and only the admin merge sets them, from what GitHub answered:
 *
 * - `merge_blocked`: a check before the merge stopped it (no GitHub App, the
 *   pull request closed or changed, checks not green, CodeRabbit threads open,
 *   or GitHub unreachable). Nothing was sent to GitHub.
 * - `merge_failed`: the merge was sent and GitHub refused it.
 *
 * Neither resolves the issue or pays points. The admin merger can try again
 * once the reason is fixed.
 */
export const MERGE_BLOCKED = "merge_blocked";
export const MERGE_FAILED = "merge_failed";
export type MergeOutcomeStatus = typeof MERGE_BLOCKED | typeof MERGE_FAILED;

/** Every review status an issue can show, in pipeline order. */
export const REVIEW_STATUSES = ["submitted", "ready_to_merge", "rejected", MERGE_BLOCKED, MERGE_FAILED, "merged"] as const;

/** The comment posted with a merge status, so the issue says what happened and what didn't. */
export function mergeOutcomeComment(status: MergeOutcomeStatus, reason: string): string {
  const lead = status === MERGE_BLOCKED ? "Merge blocked" : "Merge failed";
  return `${lead}: ${reason} Nothing was merged on GitHub, the issue was not resolved, and no points were paid.`;
}

/**
 * Set the merge status and post the matching comment in one transaction, so
 * the badge and the comment never disagree.
 */
export async function recordMergeOutcome(
  db: PrismaClient,
  input: {
    agent: AgentContext;
    bug: { id: string; tenantId: string; pullRequestUrl: string | null };
    status: MergeOutcomeStatus;
    reason: string;
  },
): Promise<void> {
  const { agent, bug, status, reason } = input;
  const body = mergeOutcomeComment(status, reason);
  await db.$transaction(async (tx) => {
    await tx.bug.update({ where: { id: bug.id }, data: { reviewStatus: status } });
    const comment = await tx.comment.create({
      data: { bugId: bug.id, authorId: agent.ownerId, agentId: agent.agentId, body, type: "comment" },
      select: { id: true },
    });
    await tx.bugActivity.create({
      data: {
        bugId: bug.id,
        actorId: agent.ownerId,
        type: "commented",
        summary: commentedSummary(body),
        metadata: { commentId: comment.id, commentPreview: commentPreview(body), reviewStatus: status },
      },
    });
    await publish(tx, {
      tenantId: bug.tenantId,
      type: "issue.updated",
      payload: { issueId: bug.id, reviewStatus: status, reason, pullRequestUrl: bug.pullRequestUrl },
      actorAgentId: agent.agentId,
      bugId: bug.id,
    });
  });
}
