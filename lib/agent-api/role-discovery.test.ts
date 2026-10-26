import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  bug: { findMany: vi.fn() },
  issueValidation: { findMany: vi.fn() },
  workflow: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/workflow", () => ({
  workflowFor: vi.fn(async () => ({
    confirmationsNeeded: 2,
    verdictsNeeded: 2,
    offerWindowSeconds: 60,
  })),
}));
vi.mock("@/lib/agent-api/validation", () => ({
  isConfirmed: vi.fn(async () => true),
}));

import { findReadyToMergeIssues } from "./merger";
import { findReviewableIssues } from "./reviewer";
import { findTriageableIssues } from "./triager";
import { findClaimableIssues } from "./contributor";
import { AgentLevelError } from "@/lib/agents/levels";

const contributor = { agentId: "c1", name: "c1", ownerId: "co", tenantId: "tenant", level: "contributor" as const, burst: false, keyId: "k" };
const triager = { agentId: "t1", name: "t1", ownerId: "to", tenantId: "tenant", level: "triager" as const, burst: false, keyId: "k" };
const reviewer = { agentId: "r1", name: "r1", ownerId: "ro", tenantId: "tenant", level: "reviewer" as const, burst: false, keyId: "k" };
const merger = { agentId: "m1", name: "m1", ownerId: "mo", tenantId: "tenant", level: "merger" as const, burst: false, keyId: "k" };

describe("Role-based discovery functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findReadyToMergeIssues", () => {
    it("enforces merger level permission", async () => {
      await expect(findReadyToMergeIssues(contributor, "p1")).rejects.toBeInstanceOf(AgentLevelError);
    });

    it("returns ready to merge issues when conditions are met", async () => {
      db.bug.findMany.mockResolvedValue([
        {
          id: "bug-1",
          number: 101,
          title: "PR ready to merge",
          projectId: "p1",
          pullRequestUrl: "https://github.com/org/repo/pull/1",
          pullRequestHeadSha: "sha-1",
          reporterId: "user-1",
          beneficiaryUserId: "user-1",
          createdByAgentId: null,
          createdAt: new Date(),
          claims: [{ agentId: "solver-1", beneficiaryUserId: "user-2", agent: { ownerUserId: "user-2" } }],
          testVerdicts: [
            { id: "v1", onBehalfOfUserId: "rev-1", pullRequestUrl: "https://github.com/org/repo/pull/1", agent: { id: "a1", ownerUserId: "rev-1" } },
            { id: "v2", onBehalfOfUserId: "rev-2", pullRequestUrl: "https://github.com/org/repo/pull/1", agent: { id: "a2", ownerUserId: "rev-2" } },
          ],
        },
      ]);

      const issues = await findReadyToMergeIssues(merger, "p1");
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        id: "bug-1",
        number: 101,
        verdictsCount: 2,
      });
    });
  });

  describe("findReviewableIssues", () => {
    it("enforces reviewer level permission", async () => {
      await expect(findReviewableIssues(contributor, "p1")).rejects.toBeInstanceOf(AgentLevelError);
    });

    it("finds reviewable issues for validation and testing", async () => {
      db.bug.findMany.mockResolvedValue([
        {
          id: "bug-2",
          number: 102,
          title: "Needs testing",
          projectId: "p1",
          pullRequestUrl: "https://github.com/org/repo/pull/2",
          reporterId: "user-1",
          beneficiaryUserId: "user-1",
          createdByAgentId: null,
          createdAt: new Date(),
          claims: [],
        },
      ]);

      const issues = await findReviewableIssues(reviewer, "p1", "test");
      expect(issues).toHaveLength(1);
      expect(issues[0].reviewType).toBe("test");
    });
  });

  describe("findTriageableIssues", () => {
    it("enforces triager level permission", async () => {
      await expect(findTriageableIssues(contributor, "p1")).rejects.toBeInstanceOf(AgentLevelError);
    });

    it("finds open issues needing triage", async () => {
      // Mock isConfirmed to false so it is treated as unconfirmed/triageable
      const { isConfirmed } = await import("@/lib/agent-api/validation");
      (isConfirmed as unknown as { mockResolvedValueOnce: (val: boolean) => void }).mockResolvedValueOnce(false);

      db.bug.findMany.mockResolvedValue([
        {
          id: "bug-3",
          number: 103,
          title: "New issue",
          projectId: "p1",
          reporterId: "user-1",
          beneficiaryUserId: "user-1",
          createdByAgentId: null,
          createdAt: new Date(),
          claims: [],
        },
      ]);

      const issues = await findTriageableIssues(triager, "p1");
      expect(issues).toHaveLength(1);
      expect(issues[0].id).toBe("bug-3");
    });
  });

  describe("findClaimableIssues", () => {
    it("enforces contributor level permission", async () => {
      await expect(findClaimableIssues({ ...contributor, level: "observer" }, "p1")).rejects.toBeInstanceOf(AgentLevelError);
    });

    it("finds confirmed issues available for bidding or claiming", async () => {
      db.bug.findMany.mockResolvedValue([
        {
          id: "bug-4",
          number: 104,
          title: "Ready to work",
          projectId: "p1",
          voteCount: 4,
          severity: "high",
          createdAt: new Date(),
        },
      ]);

      const issues = await findClaimableIssues(contributor, "p1");
      expect(issues).toHaveLength(1);
      expect(issues[0].id).toBe("bug-4");
    });
  });
});
