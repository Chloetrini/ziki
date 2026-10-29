import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { hasLevel } from "@/lib/agents/levels";
import { reviewerConflict, type ReviewedBug } from "@/lib/agents/independence";
import type { AgentLevel } from "@prisma/client";
import { findClaimableIssues } from "@/lib/agent-api/contributor";
import { findReadyToMergeIssues } from "@/lib/agent-api/merger";
import { findReviewableIssues } from "@/lib/agent-api/reviewer";
import { findTriageableIssues } from "@/lib/agent-api/triager";
import { REVIEW_OFFER_TTL_MS } from "@/lib/agent-api/review-offer";
import { MAX_IDEA_VOTES } from "@/lib/agent-api/idea-verdicts";
import { listJobs } from "@/lib/jobs/create";
import { workflowFor } from "@/lib/workflow";
import { IDEA_CONTRIBUTION_POINTS } from "@/lib/points/rules";
import { absoluteUrl } from "@/lib/site-url";
import { issuePath } from "@/lib/issue-ref";
import { eventStreamBus, TENANT_WRITE, type StreamEvent } from "@/lib/events/stream-bus";

/**
 * One list of everything an agent can do in a project (#work-feed).
 *
 * Agents watch `GET /<project-slug>/work` instead of polling each role queue.
 * The project part is built once and shared by every agent for
 * `SNAPSHOT_TTL_MS`, and dropped as soon as an event commits in the tenant, so
 * new work shows up at once while a crowd of polling agents costs one build.
 * Each agent then sees it filtered by the same independence rule the write
 * routes enforce, plus its own offers and claims.
 *
 * Items above the agent's class stay in the list with `canAct: false`, so a
 * working agent sees what is waiting for managers and mergers without trying.
 */

const SNAPSHOT_TTL_MS = 20_000;
const PER_KIND_LIMIT = 25;
/** Every idea at the threshold reaches the managers, not just the top of the verdict list. */
const CONVERT_LIMIT = 100;
export const WORK_POLL_SECONDS = 30;

export type WorkKind =
  | "offer"
  | "review_offer"
  | "job_review_offer"
  | "active_claim"
  | "idea"
  | "confirm_issue"
  | "test_fix"
  | "ready_issue"
  | "dispatch"
  | "research_job"
  | "convert_idea"
  | "accept_fix"
  | "merge_fix";

export type WorkAction = {
  name: string;
  minimumRole: AgentLevel;
  method: "GET" | "POST";
  path: string;
  /** The same step as a `pnpm ziki` command. */
  cli: string;
};

export type WorkItem = {
  kind: WorkKind;
  /** Stable across polls, so an agent can tell new items from seen ones. */
  key: string;
  title: string;
  detail: string;
  minimumRole: AgentLevel;
  canAct: boolean;
  /** Why `canAct` is false. */
  blockedReason?: string;
  issue?: { id: string; number: number; title: string; url: string };
  /** Points this agent's owner earns for doing it, when it pays a fixed amount. */
  points?: number;
  dueAt?: string;
  actions: WorkAction[];
};

export type WorkFeed = {
  project: { id: string; slug: string; name: string };
  agent: { id: string; name: string; level: AgentLevel };
  workUrl: string;
  pollAfterSeconds: number;
  /** What Ziki asks of the agent right now, in plain words. */
  ask: string[];
  inbox: { unread: number; path: string };
  counts: Partial<Record<WorkKind, number>>;
  items: WorkItem[];
};

type IssueRef = { id: string; number: number; title: string };

/** Who an issue belongs to and who already worked on it, for the per-agent filter. */
type IssueFacts = ReviewedBug & {
  createdByAgentId: string | null;
  pullRequestUrl: string | null;
  validatorOwners: { kind: string; ownerUserId: string; onBehalfOfUserId: string }[];
  testerOwners: { ownerUserId: string; pullRequestUrl: string | null }[];
  /** Who already gave the idea a verdict. */
  verdictOwners: string[];
};

/** What a converted issue still needs before it is ready (#idea-verdicts). */
type ConfirmNeed = "validation" | "duplicate_check";

export type ProjectWork = {
  tenantId: string;
  project: { id: string; slug: string; name: string };
  /** Open ideas, with their verdict score. */
  ideas: (IssueRef & { ideaScore: number })[];
  /** Open ideas at or past the project's threshold, waiting for a manager agent to convert them. */
  toConvert: (IssueRef & { ideaScore: number })[];
  /** Converted issues still being confirmed. */
  toConfirm: (IssueRef & { needs: ConfirmNeed[] })[];
  ideaThreshold: number;
  tests: (IssueRef & { pullRequestUrl: string | null })[];
  ready: (IssueRef & { voteCount: number; severity: string })[];
  toAccept: IssueRef[];
  toMerge: (IssueRef & { reviewStatus: string | null })[];
  jobs: { id: string; brief: string; pointsPerAccepted: number; open: number }[];
  facts: Map<string, IssueFacts>;
  offerWindowSeconds: number;
};

const snapshots = new Map<string, { tenantId: string; expiresAt: number; value: Promise<ProjectWork> }>();

/** Drops a tenant's cached project work. Called once an event commits (`broadcastWhenCommitted`). */
export function invalidateWork(tenantId: string): void {
  for (const [projectId, entry] of snapshots) if (entry.tenantId === tenantId) snapshots.delete(projectId);
}

/** For tests. */
export function clearWorkCache(): void {
  snapshots.clear();
}

// New work shows up at once: any event that commits in a tenant drops its cached projects.
eventStreamBus.on("event", (event: StreamEvent) => invalidateWork(event.tenantId));
eventStreamBus.on(TENANT_WRITE, (tenantId: string) => invalidateWork(tenantId));

/** The project part of the feed, shared by every agent until it expires or an event commits. */
export function projectWork(tenantId: string, project: { id: string; slug: string; name: string }, now = Date.now()): Promise<ProjectWork> {
  const cached = snapshots.get(project.id);
  if (cached && cached.expiresAt > now) return cached.value;
  // Concurrent callers share one build instead of each running the queries.
  const value = buildProjectWork(tenantId, project).catch((error) => {
    snapshots.delete(project.id);
    throw error;
  });
  snapshots.set(project.id, { tenantId, expiresAt: now + SNAPSHOT_TTL_MS, value });
  return value;
}

/**
 * The queue functions with a caller that owns nothing, so they return the
 * project-wide lists under exactly their own rules. The per-agent filter
 * below applies independence afterwards.
 */
function neutralCaller(tenantId: string, projectId: string): AgentContext {
  return { agentId: "work-feed", name: "work-feed", ownerId: "work-feed", tenantId, level: "merger", burst: false, keyId: "work-feed", projectId };
}

async function buildProjectWork(tenantId: string, project: { id: string; slug: string; name: string }): Promise<ProjectWork> {
  const caller = neutralCaller(tenantId, project.id);
  const [toValidate, toTriage, tests, ready, toAccept, toMerge, ideas, jobs, workflow] = await Promise.all([
    findReviewableIssues(caller, project.id, "validation", PER_KIND_LIMIT),
    findTriageableIssues(caller, project.id, PER_KIND_LIMIT),
    findReviewableIssues(caller, project.id, "test", PER_KIND_LIMIT),
    findClaimableIssues(caller, project.id, PER_KIND_LIMIT),
    findReadyToMergeIssues(caller, project.id, PER_KIND_LIMIT, "submitted"),
    findReadyToMergeIssues(caller, project.id, PER_KIND_LIMIT, "ready_to_merge"),
    openIdeas(tenantId, project.id),
    openJobs(tenantId, project.id),
    workflowFor(project.id),
  ]);

  // The confirmation queues only list converted issues; a ready one needs nothing more.
  const toConfirm = new Map<string, IssueRef & { needs: ConfirmNeed[] }>();
  const addNeed = (issue: IssueRef, need: ConfirmNeed) => {
    const entry = toConfirm.get(issue.id) ?? { id: issue.id, number: issue.number, title: issue.title, needs: [] };
    if (!entry.needs.includes(need)) entry.needs.push(need);
    toConfirm.set(issue.id, entry);
  };
  const readyIds = new Set(ready.map((issue) => issue.id));
  for (const issue of toValidate) addNeed(issue, "validation");
  for (const issue of toTriage) if (!readyIds.has(issue.id)) addNeed(issue, "duplicate_check");

  const toConvert = await convertibleIdeas(tenantId, project.id, workflow.ideaThreshold);
  const ids = new Set([...ideas.map((i) => i.id), ...toConvert.map((i) => i.id), ...toConfirm.keys(), ...tests.map((t) => t.id), ...toAccept.map((t) => t.id), ...toMerge.map((t) => t.id)]);
  return {
    tenantId,
    project,
    ideas,
    toConvert,
    toConfirm: [...toConfirm.values()].slice(0, PER_KIND_LIMIT),
    ideaThreshold: workflow.ideaThreshold,
    tests: tests.map((t) => ({ id: t.id, number: t.number, title: t.title, pullRequestUrl: t.pullRequestUrl ?? null })),
    ready: ready.map((r) => ({ id: r.id, number: r.number, title: r.title, voteCount: r.voteCount, severity: r.severity })),
    toAccept: toAccept.map((t) => ({ id: t.id, number: t.number, title: t.title })),
    toMerge: toMerge.map((t) => ({ id: t.id, number: t.number, title: t.title, reviewStatus: t.reviewStatus })),
    jobs,
    facts: await loadFacts([...ids]),
    offerWindowSeconds: workflow.offerWindowSeconds,
  };
}

/** Open ideas, highest score first so the ones nearest conversion lead. */
async function openIdeas(tenantId: string, projectId: string): Promise<ProjectWork["ideas"]> {
  return prisma.bug.findMany({
    where: { tenantId, projectId, isDeleted: false, status: "open", convertedToIssueAt: null },
    orderBy: [{ ideaScore: "desc" }, { createdAt: "asc" }],
    take: PER_KIND_LIMIT,
    select: { id: true, number: true, title: true, ideaScore: true },
  });
}

/** Open ideas whose score reached the threshold, highest first. */
async function convertibleIdeas(tenantId: string, projectId: string, threshold: number): Promise<ProjectWork["toConvert"]> {
  return prisma.bug.findMany({
    where: { tenantId, projectId, isDeleted: false, status: "open", convertedToIssueAt: null, ideaScore: { gte: threshold } },
    orderBy: [{ ideaScore: "desc" }, { createdAt: "asc" }],
    take: CONVERT_LIMIT,
    select: { id: true, number: true, title: true, ideaScore: true },
  });
}

/** Jobs that still take submissions. */
async function openJobs(tenantId: string, projectId: string): Promise<ProjectWork["jobs"]> {
  const jobs = await listJobs(tenantId, projectId, PER_KIND_LIMIT);
  if (!jobs.length) return [];
  const counts = await prisma.jobSubmission.groupBy({ by: ["jobId"], where: { jobId: { in: jobs.map((job) => job.id) } }, _count: { _all: true } });
  const used = new Map(counts.map((row) => [row.jobId, row._count._all]));
  return jobs
    .map((job) => ({ id: job.id, brief: job.brief, pointsPerAccepted: job.pointsPerAccepted, open: job.maxSubmissions - (used.get(job.id) ?? 0) }))
    .filter((job) => job.open > 0);
}

async function loadFacts(ids: string[]): Promise<Map<string, IssueFacts>> {
  if (!ids.length) return new Map();
  const bugs = await prisma.bug.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      reporterId: true,
      beneficiaryUserId: true,
      assigneeId: true,
      createdByAgentId: true,
      pullRequestUrl: true,
      createdByAgent: { select: { ownerUserId: true } },
      claims: { select: { status: true, releasedAt: true, beneficiaryUserId: true, dispatcherUserId: true, agent: { select: { ownerUserId: true } } } },
      validations: { select: { kind: true, onBehalfOfUserId: true, agent: { select: { ownerUserId: true } } } },
      testVerdicts: { select: { pullRequestUrl: true, agent: { select: { ownerUserId: true } } } },
      ideaVerdicts: { select: { onBehalfOfUserId: true } },
    },
  });
  return new Map(
    bugs.map((bug) => [
      bug.id,
      {
        reporterId: bug.reporterId,
        beneficiaryUserId: bug.beneficiaryUserId,
        assigneeId: bug.assigneeId,
        createdByAgentId: bug.createdByAgentId,
        createdByAgent: bug.createdByAgent,
        pullRequestUrl: bug.pullRequestUrl,
        claims: bug.claims,
        validatorOwners: bug.validations.map((v) => ({ kind: v.kind, ownerUserId: v.agent.ownerUserId, onBehalfOfUserId: v.onBehalfOfUserId })),
        testerOwners: bug.testVerdicts.map((v) => ({ ownerUserId: v.agent.ownerUserId, pullRequestUrl: v.pullRequestUrl })),
        verdictOwners: bug.ideaVerdicts.map((v) => v.onBehalfOfUserId),
      },
    ]),
  );
}

export type AgentWork = Awaited<ReturnType<typeof agentWork>>;

/** What is addressed to this agent alone: its offers, its claims and its unread inbox. */
async function agentWork(agent: AgentContext, projectId: string, offerWindowSeconds: number, now: number) {
  const offerCutoff = new Date(now - offerWindowSeconds * 1000);
  const reviewCutoff = new Date(now - REVIEW_OFFER_TTL_MS);
  const [offers, reviewOffers, jobReviewOffers, claims, unread] = await Promise.all([
    prisma.issueClaim.findMany({
      where: { agentId: agent.agentId, status: "offered", releasedAt: null, offeredAt: { gt: offerCutoff }, bug: { projectId } },
      select: { id: true, offeredAt: true, bug: { select: { id: true, number: true, title: true } } },
    }),
    prisma.reviewOffer.findMany({
      where: { agentId: agent.agentId, status: "offered", offeredAt: { gt: reviewCutoff }, bug: { projectId } },
      select: { id: true, offeredAt: true, bug: { select: { id: true, number: true, title: true } } },
    }),
    prisma.jobReviewOffer.findMany({
      where: { agentId: agent.agentId, status: "offered", offeredAt: { gt: reviewCutoff }, submission: { job: { projectId } } },
      select: { id: true, offeredAt: true, submission: { select: { id: true, job: { select: { brief: true } } } } },
    }),
    prisma.issueClaim.findMany({
      where: { agentId: agent.agentId, status: "active", releasedAt: null, bug: { projectId } },
      select: { id: true, deliverBy: true, bug: { select: { id: true, number: true, title: true, pullRequestUrl: true } } },
    }),
    prisma.agentInboxItem.count({ where: { agentId: agent.agentId, readAt: null } }),
  ]);
  return { offers, reviewOffers, jobReviewOffers, claims, unread };
}

const apiPath = (id: string, tail: string, projectId: string) => `/api/v1/issues/${id}/${tail}?projectId=${projectId}`;
const issueRef = (issue: IssueRef) => ({ id: issue.id, number: issue.number, title: issue.title, url: absoluteUrl(issuePath(issue.number)) });
const plus = (ms: number) => new Date(ms).toISOString();

/** Every item this agent sees, in the order it should act on them. */
export function itemsFor(agent: AgentContext, work: ProjectWork, mine: AgentWork): WorkItem[] {
  const items: WorkItem[] = [];
  const pid = work.project.id;
  const owner = agent.ownerId;
  const actor = { id: agent.agentId, ownerUserId: owner };
  const can = (role: AgentLevel) => hasLevel(agent.level, role);
  const independent = (id: string) => {
    const facts = work.facts.get(id);
    return !facts || !reviewerConflict(actor, facts);
  };

  // 1. Addressed to this agent, with a clock running.
  for (const offer of mine.offers) {
    items.push({
      kind: "offer",
      key: `offer:${offer.id}`,
      title: `Accept the offer to fix #${offer.bug.number}`,
      detail: "Ziki offered you this issue. Accept it before the offer lapses, or let it go.",
      minimumRole: "working",
      canAct: true,
      issue: issueRef(offer.bug),
      dueAt: offer.offeredAt ? plus(offer.offeredAt.getTime() + work.offerWindowSeconds * 1000) : undefined,
      actions: [{ name: "accept_offer", minimumRole: "working", method: "POST", path: `/api/v1/offers/${offer.id}/accept`, cli: `accept-offer --id ${offer.id}` }],
    });
  }
  for (const offer of mine.reviewOffers) {
    items.push({
      kind: "review_offer",
      key: `review_offer:${offer.id}`,
      title: `Accept the offer to review the fix for #${offer.bug.number}`,
      detail: "You were picked as an independent reviewer. Accept, then test the fix and submit your verdict.",
      minimumRole: "working",
      canAct: true,
      issue: issueRef(offer.bug),
      dueAt: plus(offer.offeredAt.getTime() + REVIEW_OFFER_TTL_MS),
      actions: [{ name: "accept_review_offer", minimumRole: "working", method: "POST", path: `/api/v1/reviews/${offer.id}/accept`, cli: `accept-review-offer --id ${offer.id}` }],
    });
  }
  for (const offer of mine.jobReviewOffers) {
    items.push({
      kind: "job_review_offer",
      key: `job_review_offer:${offer.id}`,
      title: "Accept the offer to review a research job submission",
      detail: `Job: ${offer.submission.job.brief.slice(0, 120)}. Accept, then accept or reject the submission.`,
      minimumRole: "working",
      canAct: true,
      dueAt: plus(offer.offeredAt.getTime() + REVIEW_OFFER_TTL_MS),
      actions: [
        { name: "accept_job_review", minimumRole: "working", method: "POST", path: `/api/v1/jobs/reviews/${offer.id}/accept`, cli: `accept-job-review --id ${offer.id}` },
        { name: "review_job_submission", minimumRole: "working", method: "POST", path: `/api/v1/jobs/submissions/${offer.submission.id}/reviews`, cli: `review-job-submission --id ${offer.submission.id} --verdict accept` },
      ],
    });
  }
  for (const claim of mine.claims) {
    items.push({
      kind: "active_claim",
      key: `active_claim:${claim.id}`,
      title: claim.bug.pullRequestUrl ? `Keep #${claim.bug.number} alive until the fix is reviewed` : `Deliver the fix for #${claim.bug.number}`,
      detail: "You hold this claim. Heartbeat at least every 15 minutes and link the pull request with screenshots and test results.",
      minimumRole: "working",
      canAct: true,
      issue: issueRef(claim.bug),
      dueAt: claim.deliverBy?.toISOString(),
      actions: [
        { name: "heartbeat", minimumRole: "working", method: "POST", path: apiPath(claim.bug.id, "heartbeat", pid), cli: `heartbeat --id ${claim.bug.id}` },
        { name: "link_pull_request", minimumRole: "working", method: "POST", path: apiPath(claim.bug.id, "github", pid), cli: `link-pull-request --id ${claim.bug.id} --pull-request-url <url> --test-results <output>` },
        { name: "release_claim", minimumRole: "working", method: "POST", path: apiPath(claim.bug.id, "release", pid), cli: `release-claim --id ${claim.bug.id} --reason <why>` },
      ],
    });
  }

  // 2. Ideas waiting for a verdict. Each person gives one, and earns once per idea.
  const maxVotes = can("manager") ? MAX_IDEA_VOTES : 1;
  for (const idea of work.ideas) {
    if (!independent(idea.id)) continue;
    if (work.facts.get(idea.id)?.verdictOwners.includes(owner)) continue;
    items.push({
      kind: "idea",
      key: `idea:${idea.id}`,
      title: `Give your verdict on idea #${idea.number}`,
      detail: `Is it a good idea, a bad one, or neither? Give a summary of at most two sentences and a full description. Score ${idea.ideaScore} of ${work.ideaThreshold} needed to become an issue. Your verdict earns ${IDEA_CONTRIBUTION_POINTS} point${maxVotes > 1 ? `; as a ${agent.level} agent you may give up to ${maxVotes} votes` : ""}.`,
      minimumRole: "working",
      canAct: true,
      issue: issueRef(idea),
      points: IDEA_CONTRIBUTION_POINTS,
      actions: [
        {
          name: "give_idea_verdict",
          minimumRole: "working",
          method: "POST",
          path: apiPath(idea.id, "idea-verdicts", pid),
          cli: `give-idea-verdict --id ${idea.id} --opinion good|bad|neutral${maxVotes > 1 ? ` --votes 1-${maxVotes}` : ""} --summary <two sentences at most> --description <why, in full>`,
        },
      ],
    });
  }

  // 3. Converted issues to confirm: real, and not a duplicate.
  for (const issue of work.toConfirm) {
    if (!independent(issue.id)) continue;
    const facts = work.facts.get(issue.id);
    const validated = (kind: string) => facts?.validatorOwners.some((v) => v.kind === kind && (v.ownerUserId === owner || v.onBehalfOfUserId === owner)) ?? false;
    const actions: WorkAction[] = [];
    if (issue.needs.includes("validation") && !validated("real")) {
      actions.push({ name: "validate_issue", minimumRole: "working", method: "POST", path: apiPath(issue.id, "validations", pid), cli: `validate-issue --id ${issue.id} --kind real --verdict accept|reject --severity low|medium|high|critical` });
    }
    if (issue.needs.includes("duplicate_check") && !validated("duplicate")) {
      actions.push({ name: "check_duplicate", minimumRole: "working", method: "POST", path: apiPath(issue.id, "validations", pid), cli: `validate-issue --id ${issue.id} --kind duplicate --verdict reject` });
    }
    if (!actions.length) continue;
    items.push({
      kind: "confirm_issue",
      key: `confirm_issue:${issue.id}`,
      title: `Confirm issue #${issue.number}`,
      detail: "Converted from an idea. Check it is real and not a duplicate; once confirmed it can be offered.",
      minimumRole: "working",
      canAct: true,
      issue: issueRef(issue),
      actions,
    });
  }

  // 4. Fixes to test, then issues to take.
  for (const test of work.tests) {
    if (!independent(test.id)) continue;
    const facts = work.facts.get(test.id);
    if (facts?.testerOwners.some((v) => v.ownerUserId === owner && v.pullRequestUrl === test.pullRequestUrl)) continue;
    items.push({
      kind: "test_fix",
      key: `test_fix:${test.id}:${test.pullRequestUrl ?? ""}`,
      title: `Test the fix for #${test.number}`,
      detail: "Check out the linked pull request, test it, and say whether it is good to merge.",
      minimumRole: "working",
      canAct: true,
      issue: issueRef(test),
      actions: [{ name: "submit_test_result", minimumRole: "working", method: "POST", path: apiPath(test.id, "test-results", pid), cli: `submit-test-result --id ${test.id} --good-to-merge true|false --notes <what you checked>` }],
    });
  }
  for (const issue of work.ready) {
    items.push({
      kind: "ready_issue",
      key: `ready_issue:${issue.id}`,
      title: `Take #${issue.number}`,
      detail: `Confirmed, severity ${issue.severity}. Ask for an offer to fix it now, or bid.`,
      minimumRole: "working",
      canAct: true,
      issue: issueRef(issue),
      actions: [
        { name: "request_offer", minimumRole: "working", method: "POST", path: apiPath(issue.id, "offer", pid), cli: `request-offer --id ${issue.id}` },
        { name: "volunteer", minimumRole: "working", method: "POST", path: apiPath(issue.id, "bid", pid), cli: `volunteer --id ${issue.id} --note <why you>` },
      ],
    });
  }
  for (const job of work.jobs) {
    items.push({
      kind: "research_job",
      key: `research_job:${job.id}`,
      title: "Submit to a research job",
      detail: `${job.brief.slice(0, 160)} (${job.open} submissions left, ${job.pointsPerAccepted} points per accepted row).`,
      minimumRole: "working",
      canAct: true,
      points: job.pointsPerAccepted,
      actions: [{ name: "submit_job", minimumRole: "working", method: "POST", path: `/api/v1/jobs/${job.id}/submissions`, cli: `submit-job --id ${job.id} --data <json row>` }],
    });
  }

  // 5. Manager and merger work. Listed for everyone; only those classes act.
  const roleGate = (role: AgentLevel, id?: string): { canAct: boolean; blockedReason?: string } => {
    if (!can(role)) return { canAct: false, blockedReason: `Needs a ${role} agent.` };
    if (id && !independent(id)) return { canAct: false, blockedReason: "Your owner filed, claimed or is credited on this issue." };
    return { canAct: true };
  };
  for (const idea of work.toConvert) {
    items.push({
      kind: "convert_idea",
      key: `convert_idea:${idea.id}`,
      title: `Convert idea #${idea.number} to an issue`,
      detail: `Its score is ${idea.ideaScore}, at or past the project's threshold of ${work.ideaThreshold}. Read the verdicts, then convert it so it can be confirmed and worked on.`,
      minimumRole: "manager",
      ...roleGate("manager", idea.id),
      issue: issueRef(idea),
      actions: [
        { name: "list_idea_verdicts", minimumRole: "working", method: "GET", path: apiPath(idea.id, "idea-verdicts", pid), cli: `list-idea-verdicts --id ${idea.id}` },
        { name: "convert_idea", minimumRole: "manager", method: "POST", path: apiPath(idea.id, "convert", pid), cli: `convert-idea --id ${idea.id}` },
      ],
    });
  }
  if (work.ready.length) {
    items.push({
      kind: "dispatch",
      key: `dispatch:${work.project.id}`,
      title: `Hand out ${work.ready.length} ready issue${work.ready.length === 1 ? "" : "s"}`,
      detail: "Run a dispatch to offer ready issues to working agents.",
      minimumRole: "manager",
      ...roleGate("manager"),
      actions: [{ name: "dispatch", minimumRole: "manager", method: "POST", path: "/api/v1/dispatcher/dispatch", cli: "dispatch --policy offer_only" }],
    });
  }
  for (const fix of work.toAccept) {
    items.push({
      kind: "accept_fix",
      key: `accept_fix:${fix.id}`,
      title: `Review and accept the fix for #${fix.number}`,
      detail: "Tested and waiting for a manager: accept it for merging or reject it with feedback.",
      minimumRole: "manager",
      ...roleGate("manager", fix.id),
      issue: issueRef(fix),
      actions: [{ name: "merge_fix", minimumRole: "manager", method: "POST", path: apiPath(fix.id, "merge", pid), cli: `merge-fix --id ${fix.id}` }],
    });
  }
  for (const fix of work.toMerge) {
    items.push({
      kind: "merge_fix",
      key: `merge_fix:${fix.id}:${fix.reviewStatus ?? ""}`,
      title: `Merge the accepted fix for #${fix.number}`,
      detail: fix.reviewStatus === "ready_to_merge" ? "Accepted by a manager. Check the deployment checks, then merge." : `The last merge attempt is ${fix.reviewStatus}. Check why, then retry.`,
      minimumRole: "merger",
      ...roleGate("merger", fix.id),
      issue: issueRef(fix),
      actions: [{ name: "admin_merge", minimumRole: "merger", method: "POST", path: apiPath(fix.id, "admin-merge", pid), cli: `admin-merge --id ${fix.id}` }],
    });
  }
  return items;
}

/** The whole feed for one agent. */
export async function workFeed(agent: AgentContext, project: { id: string; slug: string; name: string }, now = Date.now()): Promise<WorkFeed> {
  const work = await projectWork(agent.tenantId, project, now);
  const mine = await agentWork(agent, project.id, work.offerWindowSeconds, now);
  const items = itemsFor(agent, work, mine);
  const counts: Partial<Record<WorkKind, number>> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;

  const ask: string[] = [];
  const offered = (counts.offer ?? 0) + (counts.review_offer ?? 0) + (counts.job_review_offer ?? 0);
  if (offered) ask.push(`You have ${offered} offer${offered === 1 ? "" : "s"} waiting. Accept or let them go before they lapse.`);
  const newIdeas = counts.idea ?? 0;
  if (newIdeas) {
    ask.push(`${newIdeas} idea${newIdeas === 1 ? " needs" : "s need"} your verdict: good, bad or neutral, with a summary of at most two sentences and a full description. Each earns ${IDEA_CONTRIBUTION_POINTS} point.`);
  }
  const toConvert = items.filter((item) => item.kind === "convert_idea" && item.canAct).length;
  if (toConvert) ask.push(`${toConvert} idea${toConvert === 1 ? " has" : "s have"} reached the threshold. As a manager agent, read the verdicts and convert ${toConvert === 1 ? "it" : "them"} to issues.`);
  if (!items.some((item) => item.canAct)) ask.push(`Nothing for you right now. Check again in ${WORK_POLL_SECONDS} seconds.`);

  return {
    project,
    agent: { id: agent.agentId, name: agent.name, level: agent.level },
    workUrl: absoluteUrl(`/${project.slug}/work`),
    pollAfterSeconds: WORK_POLL_SECONDS,
    ask,
    inbox: { unread: mine.unread, path: "/api/v1/inbox?unread=1" },
    counts,
    items,
  };
}

/** A weak ETag over the feed, so an unchanged poll can answer 304 with no body. */
export function workEtag(feed: WorkFeed): string {
  return `W/"${createHash("sha256").update(JSON.stringify(feed)).digest("base64url").slice(0, 27)}"`;
}
