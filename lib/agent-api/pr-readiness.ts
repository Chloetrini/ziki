import {
  CHECKS_NOT_GREEN_MESSAGE,
  clientForInstallation,
  codeRabbitThreadsMessage,
  hasMergeConflicts,
  type GitHubClient,
  type PullRequest,
  type PullRequestRef,
} from "@/lib/github/merge-pr";
import { notifyMergeFailed } from "@/lib/agent-notifications";
import { conflictComment } from "@/lib/agent-api/merge-conflict";

/**
 * What a tester, a manager and the merger each check on the pull request
 * before they say yes (#255): every check on its head commit is green (the
 * code builds, its tests pass), CodeRabbit has no unresolved review threads,
 * and it doesn't conflict with its base branch. If any of the three fails,
 * nothing moves forward: no "good to merge", no accept, no merge. A comment
 * on the issue lists every reason, not just the first, and says what to do.
 *
 * Checking this early saves everyone work: once the author fixes any of them
 * the pull request has a new head commit, and verdicts on the old one no
 * longer count.
 *
 * Ziki doesn't build or run the code itself, so "the code is good" is the
 * reviewers' reading of it; this is the part a machine can say for sure.
 */
export type ReadinessKind = "merge_conflict" | "checks_not_green" | "review_threads" | "github_unreachable";

export type ReadinessProblem = { kind: ReadinessKind; message: string; todo: string };

export type ReadinessBlock = {
  missing: "merge_conflict" | "deployment_verification" | "review_threads";
  message: string;
  todo: string;
};

export const CHECKS_NOT_GREEN_TODO =
  "The author opens the pull request's Checks tab on GitHub (and the link next to each failing item), fixes whatever failed (tests, build, lint or the deployment) and pushes.";

export const REVIEW_THREADS_TODO =
  "The author fixes what CodeRabbit asked for (or replies if it does not apply) and resolves each thread on the pull request.";

/**
 * Whether every check, status and deployment on the head commit is green. A
 * failed deployment (Vercel, for example) counts like a failed test: the code
 * can't go live, so nothing moves forward, and the comment names what failed.
 */
export async function checksProblem(
  client: Pick<GitHubClient, "checksGreen" | "failingChecks">,
  ref: PullRequestRef,
  headSha: string,
): Promise<ReadinessProblem | null> {
  let failing: string[] = [];
  let green = true;
  try {
    if (client.failingChecks) failing = await client.failingChecks(ref, headSha);
    if (failing.length === 0) green = await client.checksGreen(ref, headSha);
  } catch {
    green = false;
    failing = ["GitHub could not be asked for the checks on this commit"];
  }
  if (failing.length === 0 && green) return null;
  const named = failing.length > 0 ? ` Not green: ${failing.join("; ")}.` : "";
  return { kind: "checks_not_green", message: `${CHECKS_NOT_GREEN_MESSAGE}${named}`, todo: CHECKS_NOT_GREEN_TODO };
}

/** Every problem the pull request has right now. Empty when it is ready. */
export async function readinessProblems(
  client: Pick<GitHubClient, "checksGreen" | "failingChecks" | "unresolvedCodeRabbitThreads">,
  ref: PullRequestRef,
  pullRequest: PullRequest,
  headSha: string,
  author?: string | null,
): Promise<ReadinessProblem[]> {
  const problems: ReadinessProblem[] = [];

  if (hasMergeConflicts(pullRequest)) {
    const note = conflictComment(author);
    problems.push({ kind: "merge_conflict", message: note.reason, todo: note.todo });
  }

  const checks = await checksProblem(client, ref, headSha);
  if (checks) problems.push(checks);

  try {
    const open = await client.unresolvedCodeRabbitThreads(ref);
    if (open > 0) {
      problems.push({ kind: "review_threads", message: codeRabbitThreadsMessage(open), todo: REVIEW_THREADS_TODO });
    }
  } catch {
    problems.push({
      kind: "github_unreachable",
      message: "GitHub could not be reached to read CodeRabbit's review threads.",
      todo: "Nothing is wrong with the fix. Try again in a few minutes.",
    });
  }

  return problems;
}

const NEXT_STEPS =
  "Then the checks run again on the new commit, the testers check it and report again, a manager accepts it again, and the merger merges it.";

const MISSING: Record<ReadinessKind, ReadinessBlock["missing"]> = {
  merge_conflict: "merge_conflict",
  checks_not_green: "deployment_verification",
  review_threads: "review_threads",
  github_unreachable: "review_threads",
};

/**
 * One message and one to-do list for all the problems, numbered when there is
 * more than one. Null when there are none.
 */
export function combineProblems(problems: ReadinessProblem[]): ReadinessBlock | null {
  if (problems.length === 0) return null;
  const [first] = problems;
  if (problems.length === 1) {
    return { missing: MISSING[first.kind], message: first.message, todo: `${first.todo} ${NEXT_STEPS}` };
  }
  const numbered = (pick: (p: ReadinessProblem) => string) =>
    problems.map((problem, index) => `(${index + 1}) ${pick(problem)}`).join(" ");
  return {
    missing: MISSING[first.kind],
    message: `The pull request isn't ready, for ${problems.length} reasons: ${numbered((p) => p.message)}`,
    todo: `${numbered((p) => p.todo)} ${NEXT_STEPS}`,
  };
}

/** The GitHub client for a project, or null when the app isn't set up. */
export function readinessClient(installationId: string | null | undefined): GitHubClient | null {
  const hasAppConfig = Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
  return hasAppConfig ? clientForInstallation(installationId) : null;
}

/** Tell the person the claim was for what is holding their fix up. */
export function notifyAuthor(input: {
  bug: { id: string; title: string };
  recipientId: string | null | undefined;
  reason: string;
  fromAgentName: string;
}): void {
  if (!input.recipientId) return;
  notifyMergeFailed({
    bugId: input.bug.id,
    bugTitle: input.bug.title,
    recipientId: input.recipientId,
    reason: input.reason,
    agent: { name: input.fromAgentName },
  });
}
