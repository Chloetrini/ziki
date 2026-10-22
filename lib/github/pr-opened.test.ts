import { describe, expect, it, vi } from "vitest";

const linkPullRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/github/link-pr", () => ({ linkPullRequest }));
import { extractIssueNumbers, linkIssuesForOpenedPullRequest } from "./pr-opened";

const PR = {
  pullRequestUrl: "https://github.com/o/r/pull/9",
  headSha: "sha-1",
  repositoryUrl: "https://github.com/o/r",
  text: ["Fixes #490", "", "fix/ziki-490"],
};

describe("extractIssueNumbers", () => {
  it("finds #number and <slug>-number references", () => {
    expect(extractIssueNumbers("Fixes #490 and #12", "ziki")).toEqual([490, 12]);
    expect(extractIssueNumbers("branch fix/ziki-490", "ziki")).toEqual([490]);
    expect(extractIssueNumbers("web-42", "ziki")).toEqual([]);
    expect(extractIssueNumbers(null, "ziki")).toEqual([]);
    expect(extractIssueNumbers("#5", null)).toEqual([5]);
  });
});

describe("linkIssuesForOpenedPullRequest", () => {
  function dbWith(bugs: object[]) {
    return {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p1", tenantId: "t1", slug: "ziki", repoUrl: "https://github.com/o/r" },
          { id: "p2", tenantId: "t2", slug: "other", repoUrl: "https://github.com/other/repo" },
        ]),
      },
      bug: { findMany: vi.fn().mockResolvedValue(bugs), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it("links a claimed, in-progress issue the pull request names", async () => {
    linkPullRequest.mockClear();
    const db = dbWith([{ id: "bug-1", pullRequestUrl: null, claims: [{ agentId: "a1", beneficiaryUserId: "u1" }] }]);
    const linked = await linkIssuesForOpenedPullRequest(PR, db as never);
    expect(linked).toEqual(["bug-1"]);
    expect(db.bug.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ projectId: "p1", number: { in: [490] }, status: "in_progress" }),
    }));
    expect(linkPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      bugId: "bug-1",
      pullRequestUrl: PR.pullRequestUrl,
      pullRequestHeadSha: "sha-1",
      actorAgentId: "a1",
      via: "github_pull_request_opened",
    }));
  });

  it("only refreshes the head SHA when the same pull request is already linked", async () => {
    linkPullRequest.mockClear();
    const db = dbWith([{ id: "bug-1", pullRequestUrl: PR.pullRequestUrl, claims: [{ agentId: "a1", beneficiaryUserId: "u1" }] }]);
    expect(await linkIssuesForOpenedPullRequest(PR, db as never)).toEqual(["bug-1"]);
    expect(db.bug.updateMany).toHaveBeenCalledWith({
      where: { id: "bug-1", pullRequestUrl: PR.pullRequestUrl },
      data: { pullRequestHeadSha: "sha-1" },
    });
    expect(linkPullRequest).not.toHaveBeenCalled();
  });

  it("skips an issue already linked to a different pull request", async () => {
    linkPullRequest.mockClear();
    const db = dbWith([{ id: "bug-1", pullRequestUrl: "https://github.com/o/r/pull/3", claims: [{ agentId: "a1", beneficiaryUserId: "u1" }] }]);
    expect(await linkIssuesForOpenedPullRequest(PR, db as never)).toEqual([]);
    expect(linkPullRequest).not.toHaveBeenCalled();
  });

  it("does nothing for a pull request in no project's repository", async () => {
    linkPullRequest.mockClear();
    const db = dbWith([]);
    const linked = await linkIssuesForOpenedPullRequest(
      { ...PR, pullRequestUrl: "https://github.com/x/y/pull/1", repositoryUrl: "https://github.com/x/y" },
      db as never,
    );
    expect(linked).toEqual([]);
    expect(db.bug.findMany).not.toHaveBeenCalled();
  });
});
