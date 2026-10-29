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
  confirming: "Requires confirmation",
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

/** Where an open issue stands on confirmation, from one bulk read (#714). */
export type IssueConfirmation = {
  stage: IssueStage;
  /** Distinct independent owners who accepted it as real. */
  accepts: number;
  /** The project's `confirmationsNeeded`. */
  needed: number;
  /** An independent agent cleared it as not a duplicate. */
  triageCleared: boolean;
};

type ReadConfirmation = Omit<IssueConfirmation, "stage"> & { status: string; converted: boolean; confirmed: boolean };

/**
 * Confirmation state of every issue matching `where`, in a fixed number of
 * queries. This is the one place "confirmed" is decided for lists, the work
 * feed and the merge queue, under the same rule as `isConfirmed()`: enough
 * independent real accepts AND an independent not-a-duplicate clearance, each
 * counted only after the latest edit and unless undone.
 */
async function readConfirmations(
  db: PrismaClient,
  where: Prisma.BugWhereInput,
): Promise<Map<string, ReadConfirmation>> {
  const bugs = await db.bug.findMany({
    where,
    select: {
      id: true,
      projectId: true,
      status: true,
      convertedToIssueAt: true,
      beneficiaryUserId: true,
      reporterId: true,
      createdByAgentId: true,
      createdByAgent: { select: { ownerUserId: true } },
    },
  });
  const result = new Map<string, ReadConfirmation>();
  if (bugs.length === 0) return result;

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
      where: {
        bugId: { in: ids },
        OR: [{ kind: "real", verdict: "accept" }, { kind: "duplicate", verdict: "reject" }],
      },
      select: {
        id: true,
        bugId: true,
        kind: true,
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
  // Only reviews given after the latest edit count, as in isConfirmed().
  const acceptsByBug = new Map<string, AcceptingReview[]>();
  const clearsByBug = new Map<string, AcceptingReview[]>();
  for (const validation of validations) {
    const cutoff = revisedAt.get(validation.bugId);
    if (cutoff && validation.createdAt <= cutoff) continue;
    const byBug = validation.kind === "duplicate" ? clearsByBug : acceptsByBug;
    const list = byBug.get(validation.bugId) ?? [];
    list.push({
      id: validation.id,
      agentId: validation.agentId,
      ownerUserId: validation.agent.ownerUserId,
      onBehalfOfUserId: validation.onBehalfOfUserId,
    });
    byBug.set(validation.bugId, list);
  }

  for (const bug of bugs) {
    // As isConfirmed() does (recordedReviewBug, #579): a later assignee or
    // claim must not undo a review that was independent when it was given.
    const reviewed: ReviewedBug = {
      beneficiaryUserId: bug.beneficiaryUserId,
      reporterId: bug.reporterId,
      assigneeId: null,
      createdByAgent: bug.createdByAgent,
      claims: [],
    };
    const undoneIds = undoneByBug.get(bug.id) ?? new Set<string>();
    const accepts = confirmationCount({ createdByAgentId: bug.createdByAgentId, accepts: acceptsByBug.get(bug.id) ?? [], undoneIds, bug: reviewed });
    // The same independence rules decide whether a clearance counts.
    const triageCleared = confirmationCount({ createdByAgentId: bug.createdByAgentId, accepts: clearsByBug.get(bug.id) ?? [], undoneIds, bug: reviewed }) > 0;
    const needed = workflows.get(bug.projectId)?.confirmationsNeeded ?? DEFAULT_PROJECT_WORKFLOW.confirmationsNeeded;
    const confirmed = isConfirmedCount(accepts, needed) && triageCleared;
    result.set(bug.id, { status: bug.status, converted: bug.convertedToIssueAt !== null, confirmed, accepts, needed, triageCleared });
  }
  return result;
}

/**
 * Stage and confirmation state of every open issue matching `where`, from one
 * bulk read (see `readConfirmations`). A missing validation table leaves the
 * map empty so the list still renders.
 */
export async function openIssueConfirmations(
  db: PrismaClient,
  where: Prisma.BugWhereInput,
): Promise<Map<string, IssueConfirmation>> {
  const read = await readConfirmations(db, { ...where, status: "open", isDeleted: false });
  const result = new Map<string, IssueConfirmation>();
  for (const [id, { status, converted, confirmed, accepts, needed, triageCleared }] of read) {
    const stage = issueStage({ status, converted, confirmed });
    if (stage) result.set(id, { stage, accepts, needed, triageCleared });
  }
  return result;
}

/**
 * Ids of the converted, confirmed issues matching `where`, whatever their
 * status (an issue being worked on is `in_progress`), from one bulk read.
 */
export async function confirmedIssueIds(db: PrismaClient, where: Prisma.BugWhereInput): Promise<Set<string>> {
  const read = await readConfirmations(db, { ...where, isDeleted: false, convertedToIssueAt: { not: null } });
  return new Set([...read].filter(([, c]) => c.converted && c.confirmed).map(([id]) => id));
}

/** Stage of every open issue matching `where` (see `openIssueConfirmations`). */
export async function openIssueStages(
  db: PrismaClient,
  where: Prisma.BugWhereInput,
): Promise<Map<string, IssueStage>> {
  const confirmations = await openIssueConfirmations(db, where);
  return new Map([...confirmations].map(([id, confirmation]) => [id, confirmation.stage]));
}
