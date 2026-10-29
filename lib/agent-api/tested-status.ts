import type { Prisma, PrismaClient } from "@prisma/client";
import { reviewerConflict, reviewerCreditConflict, type ReviewedBug } from "@/lib/agents/independence";
import { workflowFor } from "@/lib/workflow";

/**
 * "Tested" is the Done step (Ziki #713): a pull request is linked and the project's
 * required reviewers, each with a different owner and none on the fixer's side,
 * said it is good to merge on that pull request. It sits between `submitted`
 * (In progress) and `ready_to_merge` (a manager accepted it), and it moves on
 * its own: a verdict that brings the count up makes the fix tested, one that
 * takes it back (a reviewer changes their mind) returns it to submitted.
 * Linking a new pull request starts again at submitted.
 */
export const TESTED = "tested";

type Db = PrismaClient | Prisma.TransactionClient;

const bugSelect = {
  id: true,
  projectId: true,
  reviewStatus: true,
  pullRequestUrl: true,
  assigneeId: true,
  beneficiaryUserId: true,
  reporterId: true,
  createdByAgentId: true,
  createdByAgent: { select: { ownerUserId: true } },
  claims: {
    select: {
      status: true,
      releasedAt: true,
      agentId: true,
      beneficiaryUserId: true,
      dispatcherUserId: true,
      agent: { select: { ownerUserId: true } },
    },
  },
} satisfies Prisma.BugSelect;

/** The good-to-merge verdicts that count, the same rule the manager's accept uses. */
export async function countedGoodVerdicts(db: Db, bugId: string): Promise<{ counted: number; needed: number } | null> {
  const bug = await db.bug.findUnique({ where: { id: bugId }, select: bugSelect });
  if (!bug?.pullRequestUrl) return null;
  const verdicts = await db.testVerdict.findMany({
    where: { bugId, goodToMerge: true, pullRequestUrl: bug.pullRequestUrl },
    select: { onBehalfOfUserId: true, agent: { select: { id: true, ownerUserId: true } } },
  });
  const claim = bug.claims.find((c) => c.status === "active" && !c.releasedAt) ?? null;
  const reviewed = bug as unknown as ReviewedBug;
  const owners = new Set<string>();
  for (const verdict of verdicts) {
    if (claim && (verdict.agent.id === claim.agentId || verdict.agent.ownerUserId === claim.agent.ownerUserId)) continue;
    if (reviewerConflict({ id: verdict.agent.id, ownerUserId: verdict.agent.ownerUserId }, reviewed)) continue;
    if (reviewerCreditConflict(verdict.onBehalfOfUserId, reviewed)) continue;
    owners.add(verdict.agent.ownerUserId);
  }
  const { verdictsNeeded } = await workflowFor(bug.projectId, db);
  return { counted: owners.size, needed: verdictsNeeded };
}

/**
 * Move a fix between In progress (`submitted`) and Done (`tested`) after a
 * verdict. Later steps (ready to merge, merged, rejected, blocked) are left
 * alone. Returns the new review status when it changed, else null.
 */
export async function refreshTestedStatus(db: Db, bugId: string, actorUserId: string): Promise<string | null> {
  const bug = await db.bug.findUnique({ where: { id: bugId }, select: { reviewStatus: true, pullRequestUrl: true } });
  if (!bug?.pullRequestUrl) return null;
  const current = bug.reviewStatus ?? "submitted";
  if (current !== "submitted" && current !== TESTED) return null;

  const count = await countedGoodVerdicts(db, bugId);
  if (!count) return null;
  const next = count.counted >= count.needed ? TESTED : "submitted";
  if (next === current) return null;

  await db.bug.update({ where: { id: bugId }, data: { reviewStatus: next } });
  await db.bugActivity.create({
    data: {
      bugId,
      actorId: actorUserId,
      type: "status_changed",
      summary:
        next === TESTED
          ? `${count.counted} independent reviewers said good to merge: moved to Done`
          : `Fewer than ${count.needed} independent reviewers say good to merge: back to In progress`,
      metadata: { field: "reviewStatus", from: current, to: next, counted: count.counted, needed: count.needed },
    },
  });
  return next;
}
