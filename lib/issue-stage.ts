import type { Prisma, PrismaClient } from "@prisma/client";
import { reviewerConflict, reviewerCreditConflict, type ReviewedBug } from "@/lib/agents/independence";
import { workflowFor } from "@/lib/workflow";
import { DEFAULT_PROJECT_WORKFLOW } from "@/lib/workflow-config";

/**
 * Where an open report sits before someone starts the work. Not a status.
 *
 * - `idea`: people give it good, bad or neutral verdicts until its net score
 *   reaches the project's `ideaThreshold`; then a manager agent converts it.
 * - `confirming`: converted to an issue, waiting for independent reviewers to
 *   confirm it is real and not a duplicate.
 * - `ready`: a confirmed issue, so it can be passed on.
 *
 * Idea verdicts do not carry over: the issue is confirmed on its own.
 */
export type IssueStage = "idea" | "confirming" | "ready";

/** List filters. `ready` is the issue that can be passed on. */
export type IssueStageView = IssueStage;

export const issueStageLabels: Record<IssueStage, string> = {
  idea: "Idea",
  confirming: "Confirming",
  ready: "Ready",
};

/** An open report is an idea until a manager agent converts it to an issue. */
export type Intake = "idea" | "issue";

/** `?stage=` values, including the names links used before ideas took verdicts. */
export function parseIssueStageView(raw: string | null | undefined): IssueStageView | null {
  if (raw === "idea" || raw === "confirming" || raw === "ready") return raw;
  if (raw === "reported") return "idea";
  if (raw === "confirmed") return "confirming";
  return null;
}

export function intakeOf(stage: IssueStage): Intake {
  return stage === "idea" ? "idea" : "issue";
}

export function intakeLabel(stage: IssueStage): string {
  return intakeOf(stage) === "issue" ? "Issue" : "Idea";
}

/** Idea until a manager agent converts it, whether or not it is still open. */
export function intakeKind(input: { converted: boolean }): Intake {
  return input.converted ? "issue" : "idea";
}

export function intakeDetail(stage: IssueStage, idea?: { score: number; threshold: number }): string {
  if (stage === "ready") return "This is an issue. Reviewers confirmed it, so it can be passed on.";
  if (stage === "confirming") {
    return "This is an issue. It can be passed on once independent reviewers confirm it is real and not a duplicate.";
  }
  if (!idea) return "This is an idea. Give it a verdict: good, bad or neutral. A manager agent converts it to an issue once enough people think it is good.";
  const left = Math.max(0, idea.threshold - idea.score);
  if (left === 0) return `This is an idea with a score of ${idea.score}. It has reached ${idea.threshold}, so a manager agent can convert it to an issue.`;
  return `This is an idea with a score of ${idea.score}. It needs ${left} more good vote${left === 1 ? "" : "s"} (net) before a manager agent can convert it to an issue.`;
}

/**
 * The stage of an open report. Anything no longer open has no stage.
 */
export function issueStage(input: {
  status: string;
  converted: boolean;
  confirmed: boolean;
}): IssueStage | null {
  if (input.status !== "open") return null;
  if (!input.converted) return "idea";
  return input.confirmed ? "ready" : "confirming";
}

/** Where a manager agent may convert an idea: open, not converted, at the project's threshold. */
export function isConvertible(input: { status: string; converted: boolean; ideaScore: number }, threshold: number): boolean {
  return input.status === "open" && !input.converted && input.ideaScore >= threshold;
}

type AcceptingReview = { id: string; agentId: string; ownerUserId: string; onBehalfOfUserId?: string };

/** Distinct independent owners who accepted the issue as real. */
export function confirmationCount(input: {
  createdByAgentId: string | null;
  accepts: readonly AcceptingReview[];
  undoneIds: ReadonlySet<string>;
  bug: ReviewedBug;
}): number {
  const owners = new Set<string>();
  for (const accept of input.accepts) {
    if (input.createdByAgentId && accept.agentId === input.createdByAgentId) continue;
    if (input.undoneIds.has(accept.id)) continue;
    if (reviewerConflict({ id: accept.agentId, ownerUserId: accept.ownerUserId }, input.bug)) continue;
    if (reviewerCreditConflict(accept.onBehalfOfUserId ?? accept.ownerUserId, input.bug)) continue;
    owners.add(accept.ownerUserId);
  }
  return owners.size;
}

export function isConfirmedCount(
  count: number,
  needed = DEFAULT_PROJECT_WORKFLOW.confirmationsNeeded,
): boolean {
  return count >= needed;
}

/**
 * Stage of every open issue matching `where`. A missing validation table
 * leaves the map empty so the list still renders.
 */
export async function openIssueStages(
  db: PrismaClient,
  where: Prisma.BugWhereInput,
): Promise<Map<string, IssueStage>> {
  const bugs = await db.bug.findMany({
    where: { ...where, status: "open", isDeleted: false },
    select: {
      id: true,
      projectId: true,
      status: true,
      convertedToIssueAt: true,
      beneficiaryUserId: true,
      assigneeId: true,
      reporterId: true,
      createdByAgentId: true,
      createdByAgent: { select: { ownerUserId: true } },
      claims: {
        where: { status: "active", releasedAt: null },
        select: { status: true, releasedAt: true, beneficiaryUserId: true, dispatcherUserId: true, agent: { select: { ownerUserId: true } } },
      },
    },
  });
  const stages = new Map<string, IssueStage>();
  if (bugs.length === 0) return stages;

  const ids = bugs.map((bug) => bug.id);
  const projectIds = [...new Set(bugs.map((bug) => bug.projectId))];
  const workflows = new Map(
    await Promise.all(projectIds.map(async (projectId) => [projectId, await workflowFor(projectId, db)] as const)),
  );
  const [revisions, validations, undone] = await Promise.all([
    db.bugRevision.findMany({
      where: { bugId: { in: ids } },
      select: { bugId: true, editedAt: true },
    }),
    db.issueValidation.findMany({
      where: { bugId: { in: ids }, kind: "real", verdict: "accept" },
      select: {
        id: true,
        bugId: true,
        createdAt: true,
        agentId: true,
        onBehalfOfUserId: true,
        agent: { select: { ownerUserId: true } },
      },
    }),
    db.agentAuditEvent.findMany({
      where: { action: "issue.validated", bugId: { in: ids }, undoneAt: { not: null } },
      select: { bugId: true, payload: true },
    }),
  ]);

  const revisedAt = new Map<string, Date>();
  for (const revision of revisions) {
    const current = revisedAt.get(revision.bugId);
    if (!current || revision.editedAt > current) revisedAt.set(revision.bugId, revision.editedAt);
  }
  const undoneByBug = new Map<string, Set<string>>();
  for (const event of undone) {
    const validationId = (event.payload as { validationId?: string } | null)?.validationId;
    if (!validationId || !event.bugId) continue;
    const set = undoneByBug.get(event.bugId) ?? new Set<string>();
    set.add(validationId);
    undoneByBug.set(event.bugId, set);
  }
  const acceptsByBug = new Map<string, AcceptingReview[]>();
  for (const validation of validations) {
    const cutoff = revisedAt.get(validation.bugId);
    if (cutoff && validation.createdAt <= cutoff) continue;
    const list = acceptsByBug.get(validation.bugId) ?? [];
    list.push({
      id: validation.id,
      agentId: validation.agentId,
      ownerUserId: validation.agent.ownerUserId,
      onBehalfOfUserId: validation.onBehalfOfUserId,
    });
    acceptsByBug.set(validation.bugId, list);
  }

  for (const bug of bugs) {
    const reviewed: ReviewedBug = {
      beneficiaryUserId: bug.beneficiaryUserId,
      reporterId: bug.reporterId,
      assigneeId: bug.assigneeId,
      createdByAgent: bug.createdByAgent,
      claims: bug.claims,
    };
    const confirmed = isConfirmedCount(
      confirmationCount({
        createdByAgentId: bug.createdByAgentId,
        accepts: acceptsByBug.get(bug.id) ?? [],
        undoneIds: undoneByBug.get(bug.id) ?? new Set(),
        bug: reviewed,
      }),
      workflows.get(bug.projectId)?.confirmationsNeeded ?? DEFAULT_PROJECT_WORKFLOW.confirmationsNeeded,
    );
    const stage = issueStage({ status: bug.status, converted: bug.convertedToIssueAt !== null, confirmed });
    if (stage) stages.set(bug.id, stage);
  }
  return stages;
}
