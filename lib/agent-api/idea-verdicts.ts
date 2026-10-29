import { z } from "zod";
import type { AgentLevel, IdeaOpinion, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { hasLevel, requireLevel } from "@/lib/agents/levels";
import { audit } from "@/lib/agents/audit";
import { IssueApiError } from "@/lib/agent-api/issues";
import { publish } from "@/lib/agent-api/events";
import { award } from "@/lib/points/award";
import { IDEA_CONTRIBUTION_POINTS, ideaContributionSourceKey } from "@/lib/points/rules";
import { workflowFor } from "@/lib/workflow";

/**
 * The idea stage (#idea-verdicts). Each person gives an idea one verdict —
 * good, bad or neutral — with a comment and a summary of at most two
 * sentences. Good adds its votes to the idea's score, bad takes them away,
 * neutral adds nothing. A verdict carries 1 vote; a manager or merger agent
 * may ask for up to 5. A newer verdict from the same person replaces theirs.
 *
 * When the score reaches the project's `ideaThreshold`, a manager agent may
 * convert the idea to an issue. The verdicts stay with the idea: the issue is
 * then confirmed on its own.
 */

export const IDEA_SUMMARY_MAX_CHARS = 300;
export const MAX_IDEA_VOTES = 5;
const COMMENT_MAX_CHARS = 10_000;

/** Sentences end in `.`, `!` or `?` followed by a space or the end. */
export function sentenceCount(text: string): number {
  return text.trim().split(/(?<=[.!?])\s+/).filter((part) => part.trim()).length;
}

const id = z.string().trim().min(1).max(191);

export const ideaVerdictSchema = z
  .object({
    projectId: id.optional(),
    opinion: z.enum(["good", "bad", "neutral"]),
    votes: z.number().int().min(1).max(MAX_IDEA_VOTES).optional(),
    summary: z
      .string()
      .trim()
      .min(1, "Add a summary.")
      .max(IDEA_SUMMARY_MAX_CHARS, `Keep the summary under ${IDEA_SUMMARY_MAX_CHARS} characters.`)
      .refine((text) => sentenceCount(text) <= 2, "Keep the summary to two sentences."),
    comment: z.string().trim().min(1, "Add a comment explaining your verdict.").max(COMMENT_MAX_CHARS),
  })
  .strict();

export type IdeaVerdictInput = z.infer<typeof ideaVerdictSchema>;

/** Who gives the verdict: an agent on its owner's behalf, or a person in the web app. */
export type VerdictGiver = { tenantId: string; userId: string; agent?: { id: string; level: AgentLevel } };

/** How many votes this giver may put on one verdict. */
export function maxVotesFor(giver: VerdictGiver): number {
  return giver.agent && hasLevel(giver.agent.level, "manager") ? MAX_IDEA_VOTES : 1;
}

/** What good, bad and neutral add to an idea's score. */
export function verdictScore(verdicts: readonly { opinion: IdeaOpinion; votes: number }[]): number {
  return verdicts.reduce((sum, v) => sum + (v.opinion === "good" ? v.votes : v.opinion === "bad" ? -v.votes : 0), 0);
}

type Tx = Prisma.TransactionClient;

type LockedIdea = {
  id: string;
  tenantId: string;
  projectId: string;
  status: string;
  reporterId: string;
  beneficiaryUserId: string | null;
  convertedToIssueAt: Date | null;
  createdByOwnerId: string | null;
};

async function lockedIdea(tx: Tx, tenantId: string, projectId: string, bugId: string): Promise<LockedIdea> {
  const rows = await tx.$queryRaw<LockedIdea[]>`
    SELECT b."id", b."tenantId", b."projectId", b."status"::text AS "status", b."reporterId",
           b."beneficiaryUserId", b."convertedToIssueAt", a."ownerUserId" AS "createdByOwnerId"
    FROM "Bug" b
    LEFT JOIN "Agent" a ON a."id" = b."createdByAgentId"
    WHERE b."id" = ${bugId}
      AND b."tenantId" = ${tenantId}
      AND b."projectId" = ${projectId}
      AND b."isDeleted" = false
    FOR NO KEY UPDATE OF b
  `;
  if (!rows.length) throw new IssueApiError(404, "Issue not found in this project.");
  return rows[0];
}

/** The idea's owner can't give it a verdict or convert it: independence is by owner. */
function ownsIdea(idea: LockedIdea, userId: string): boolean {
  return idea.reporterId === userId || idea.beneficiaryUserId === userId || idea.createdByOwnerId === userId;
}

function assertOpenIdea(idea: LockedIdea): void {
  if (idea.convertedToIssueAt) {
    throw new IssueApiError(409, "This is an issue now. Idea verdicts only apply to ideas.", { error: "not_an_idea" });
  }
  if (idea.status !== "open") throw new IssueApiError(409, "This idea is closed.", { error: "idea_closed" });
}

async function rescore(tx: Tx, bugId: string): Promise<number> {
  const verdicts = await tx.ideaVerdict.findMany({ where: { bugId }, select: { opinion: true, votes: true } });
  const ideaScore = verdictScore(verdicts);
  await tx.bug.update({ where: { id: bugId }, data: { ideaScore } });
  return ideaScore;
}

export type GivenVerdict = {
  verdict: { id: string; opinion: IdeaOpinion; votes: number; summary: string; commentId: string | null };
  ideaScore: number;
  ideaThreshold: number;
  convertible: boolean;
  /** True when this replaced an earlier verdict from the same person. */
  replaced: boolean;
  /** Points paid for this contribution: 1 for the person's first verdict on the idea, else 0. */
  pointsAwarded: number;
};

/** Records `giver`'s verdict on an idea, replacing any earlier one of theirs. */
export async function giveIdeaVerdict(
  giver: VerdictGiver,
  projectId: string,
  bugId: string,
  input: IdeaVerdictInput,
): Promise<GivenVerdict> {
  const votes = input.votes ?? 1;
  const allowed = maxVotesFor(giver);
  if (votes > allowed) {
    throw new IssueApiError(
      422,
      allowed === 1
        ? "A verdict carries 1 vote. Only manager and merger agents may give more."
        : `A verdict carries at most ${allowed} votes.`,
      { error: "too_many_votes", maxVotes: allowed },
    );
  }
  const { ideaThreshold } = await workflowFor(projectId);

  return prisma.$transaction(async (tx) => {
    const idea = await lockedIdea(tx, giver.tenantId, projectId, bugId);
    assertOpenIdea(idea);
    if (ownsIdea(idea, giver.userId)) {
      throw new IssueApiError(403, "You can't give a verdict on your own idea.", { error: "own_idea" });
    }

    const comment = await tx.comment.create({
      data: { bugId, authorId: giver.userId, agentId: giver.agent?.id ?? null, body: input.comment },
      select: { id: true },
    });
    const existing = await tx.ideaVerdict.findUnique({
      where: { bugId_onBehalfOfUserId: { bugId, onBehalfOfUserId: giver.userId } },
      select: { id: true },
    });
    const data = {
      agentId: giver.agent?.id ?? null,
      opinion: input.opinion,
      votes,
      summary: input.summary,
      commentId: comment.id,
    };
    const verdict = await tx.ideaVerdict.upsert({
      where: { bugId_onBehalfOfUserId: { bugId, onBehalfOfUserId: giver.userId } },
      create: { bugId, onBehalfOfUserId: giver.userId, ...data },
      update: data,
      select: { id: true, opinion: true, votes: true, summary: true, commentId: true },
    });
    const ideaScore = await rescore(tx, bugId);
    await tx.bug.update({ where: { id: bugId }, data: { updatedAt: new Date() } });

    // The first verdict on each idea earns the person a point; the key makes a replacement free.
    const paid = await award(tx, {
      tenantId: giver.tenantId,
      userId: giver.userId,
      bugId,
      role: "idea",
      points: IDEA_CONTRIBUTION_POINTS,
      sourceKey: ideaContributionSourceKey(bugId, giver.userId),
    });

    const convertible = ideaScore >= ideaThreshold;
    await publish(tx, {
      tenantId: giver.tenantId,
      type: "idea.verdict",
      actorAgentId: giver.agent?.id ?? null,
      bugId,
      payload: {
        issueId: bugId,
        projectId,
        userId: giver.userId,
        opinion: input.opinion,
        votes,
        ideaScore,
        ideaThreshold,
        convertible,
        replaced: Boolean(existing),
      },
    });

    return { verdict, ideaScore, ideaThreshold, convertible, replaced: Boolean(existing), pointsAwarded: paid ? IDEA_CONTRIBUTION_POINTS : 0 };
  });
}

/** Every verdict on an idea, newest first, with the score and threshold. */
export async function listIdeaVerdicts(scope: { tenantId: string; projectId: string }, bugId: string) {
  const bug = await prisma.bug.findFirst({
    where: { id: bugId, tenantId: scope.tenantId, projectId: scope.projectId, isDeleted: false },
    select: { id: true, ideaScore: true, convertedToIssueAt: true, status: true },
  });
  if (!bug) throw new IssueApiError(404, "Issue not found in this project.");
  const [{ ideaThreshold }, verdicts] = await Promise.all([
    workflowFor(scope.projectId),
    prisma.ideaVerdict.findMany({
      where: { bugId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        opinion: true,
        votes: true,
        summary: true,
        commentId: true,
        onBehalfOfUserId: true,
        agentId: true,
        createdAt: true,
        updatedAt: true,
        onBehalfOf: { select: { name: true } },
        agent: { select: { name: true } },
      },
    }),
  ]);
  const counts = { good: 0, bad: 0, neutral: 0 };
  for (const verdict of verdicts) counts[verdict.opinion] += verdict.votes;
  return {
    idea: bug.convertedToIssueAt === null,
    ideaScore: bug.ideaScore,
    ideaThreshold,
    convertible: bug.status === "open" && bug.convertedToIssueAt === null && bug.ideaScore >= ideaThreshold,
    votes: counts,
    verdicts: verdicts.map(({ onBehalfOf, agent, ...verdict }) => ({ ...verdict, by: onBehalfOf.name, agentName: agent?.name ?? null })),
  };
}

/**
 * A manager agent turns an idea whose score reached the threshold into an
 * issue. Not its owner's own idea. The issue then needs confirming.
 */
export async function convertIdea(agent: AgentContext, projectId: string, bugId: string) {
  requireLevel(agent, "manager");
  const { ideaThreshold } = await workflowFor(projectId);
  const converted = await prisma.$transaction(async (tx) => {
    const idea = await lockedIdea(tx, agent.tenantId, projectId, bugId);
    assertOpenIdea(idea);
    if (ownsIdea(idea, agent.ownerId)) {
      throw new IssueApiError(403, "A manager agent can't convert its owner's own idea.", { error: "not_independent" });
    }
    const { ideaScore } = await tx.bug.findUniqueOrThrow({ where: { id: bugId }, select: { ideaScore: true } });
    if (ideaScore < ideaThreshold) {
      throw new IssueApiError(409, `This idea has a score of ${ideaScore}; it needs ${ideaThreshold} before it can be converted.`, {
        error: "below_threshold",
        ideaScore,
        ideaThreshold,
      });
    }
    const at = new Date();
    await tx.bug.update({ where: { id: bugId }, data: { convertedToIssueAt: at, convertedByAgentId: agent.agentId, updatedAt: at } });
    await publish(tx, {
      tenantId: agent.tenantId,
      type: "issue.converted",
      actorAgentId: agent.agentId,
      bugId,
      payload: { issueId: bugId, projectId, ideaScore, ideaThreshold },
    });
    return { issueId: bugId, convertedAt: at.toISOString(), ideaScore, ideaThreshold };
  });
  await audit(agent, "idea.converted", bugId, { ideaScore: converted.ideaScore, ideaThreshold: converted.ideaThreshold }, { bugId });
  return { ...converted, stage: "confirming" as const };
}
