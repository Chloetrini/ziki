import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { linkPullRequest } from "@/lib/github/link-pr";
import { parseGitHubRepoUrl, parsePullRequestUrl, sameRepo } from "@/lib/github/merge-pr";

/**
 * Auto-link a pull request that names an issue (#474 follow-up).
 *
 * Agents are told to open pull requests whose title, body, or branch names
 * the issue (`Fixes #490`, `ziki-490`). When GitHub sends the `opened`,
 * `reopened`, `edited`, or `synchronize` pull_request event, this finds the
 * referenced issue in the project the repository belongs to and records the
 * link itself — the agent never has to call `POST /api/v1/issues/{id}/github`.
 *
 * Linking is gated: the issue must be in_progress with an active claim and
 * no pull request yet. A `synchronize` on an already-linked pull request only
 * refreshes the recorded head SHA. Spoofed references can point a claim at
 * the wrong PR, but the claim holder can still re-link before acceptance,
 * and the acceptance gate binds the reviewed PR afterward.
 */

/** Issue numbers named in free text: `#490` or a `<slug>-490` reference. */
export function extractIssueNumbers(
  text: string | null | undefined,
  projectSlug: string | null | undefined,
): number[] {
  if (!text) return [];
  const numbers = new Set<number>();
  for (const match of text.matchAll(/#(\d{1,9})\b/g)) numbers.add(Number(match[1]));
  if (projectSlug) {
    const slug = projectSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of text.matchAll(new RegExp(`\\b${slug}-(\\d{1,9})\\b`, "gi"))) {
      numbers.add(Number(match[1]));
    }
  }
  return [...numbers];
}

export type OpenedPullRequest = {
  /** `pull_request.html_url`. */
  pullRequestUrl: string;
  /** `pull_request.head.sha`. */
  headSha: string | null;
  /** `repository.html_url` — identifies the project via `Project.repoUrl`. */
  repositoryUrl: string;
  /** Text scanned for issue references: title, body, head branch name. */
  text: string[];
};

/**
 * Link every eligible issue the pull request references; returns the issue
 * ids that were linked or had their head SHA refreshed.
 */
export async function linkIssuesForOpenedPullRequest(
  pr: OpenedPullRequest,
  db: PrismaClient = prisma,
): Promise<string[]> {
  const repo = parseGitHubRepoUrl(pr.repositoryUrl);
  const prRepo = parsePullRequestUrl(pr.pullRequestUrl);
  if (!repo || !prRepo || !sameRepo(repo, prRepo)) return [];

  const projects = await db.project.findMany({
    where: { repoUrl: { not: null } },
    select: { id: true, tenantId: true, slug: true, repoUrl: true },
  });
  const linked: string[] = [];

  for (const project of projects) {
    const projectRepo = parseGitHubRepoUrl(project.repoUrl);
    if (!projectRepo || !sameRepo(projectRepo, repo)) continue;

    const numbers = new Set<number>();
    for (const text of pr.text) {
      for (const n of extractIssueNumbers(text, project.slug)) numbers.add(n);
    }
    if (!numbers.size) continue;

    const bugs = await db.bug.findMany({
      where: {
        projectId: project.id,
        tenantId: project.tenantId,
        number: { in: [...numbers] },
        isDeleted: false,
        status: "in_progress",
        claims: { some: { status: "active", releasedAt: null } },
      },
      select: {
        id: true,
        pullRequestUrl: true,
        claims: {
          where: { status: "active", releasedAt: null },
          take: 1,
          select: { agentId: true, beneficiaryUserId: true },
        },
      },
    });

    for (const bug of bugs) {
      const claim = bug.claims[0];
      if (!claim) continue;
      if (bug.pullRequestUrl === pr.pullRequestUrl) {
        // A `synchronize`/`edited` on the linked PR: refresh the head SHA
        // quietly — no second activity entry, event, or review offers.
        await db.bug.updateMany({
          where: { id: bug.id, pullRequestUrl: pr.pullRequestUrl },
          data: { pullRequestHeadSha: pr.headSha },
        });
        linked.push(bug.id);
        continue;
      }
      if (bug.pullRequestUrl) continue;
      try {
        await linkPullRequest({
          bugId: bug.id,
          tenantId: project.tenantId,
          projectId: project.id,
          pullRequestUrl: pr.pullRequestUrl,
          pullRequestHeadSha: pr.headSha,
          actorAgentId: claim.agentId,
          actorUserId: claim.beneficiaryUserId,
          via: "github_pull_request_opened",
          db,
        });
        linked.push(bug.id);
      } catch {
        // A raced relink or revoked agent must not fail the webhook.
      }
    }
  }
  return linked;
}
