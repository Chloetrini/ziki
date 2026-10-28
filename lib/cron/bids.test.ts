import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBugFindMany = vi.hoisted(() => vi.fn());
const mockBugActivityCreate = vi.hoisted(() => vi.fn());
const mockCommentFindMany = vi.hoisted(() => vi.fn());
const mockCommentFindFirst = vi.hoisted(() => vi.fn());
const mockCommentCreate = vi.hoisted(() => vi.fn());
const mockCommentUpdate = vi.hoisted(() => vi.fn());
const mockIssueBidFindMany = vi.hoisted(() => vi.fn());
const mockIssueBidFindUnique = vi.hoisted(() => vi.fn());
const mockIssueClaimCount = vi.hoisted(() => vi.fn());
const mockAwardBid = vi.hoisted(() => vi.fn());
const mockIsConfirmed = vi.hoisted(() => vi.fn());
const mockWorkflowFor = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bug: { findMany: mockBugFindMany },
    bugActivity: { create: mockBugActivityCreate },
    comment: {
      findMany: mockCommentFindMany,
      findFirst: mockCommentFindFirst,
      create: mockCommentCreate,
      update: mockCommentUpdate,
    },
    issueBid: {
      findMany: mockIssueBidFindMany,
      findUnique: mockIssueBidFindUnique,
    },
    issueClaim: { count: mockIssueClaimCount },
  },
}));

vi.mock("@/lib/agent-api/bid", () => ({ awardBid: mockAwardBid }));
vi.mock("@/lib/agent-api/validation", () => ({ isConfirmed: mockIsConfirmed }));
vi.mock("@/lib/workflow", () => ({ workflowFor: mockWorkflowFor }));
vi.mock("@/lib/agent-api/events", () => ({ publish: mockPublish }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { sweepPendingBids } from "./bids";

describe("sweepPendingBids - Fair Bid Auto-Assignment Handshake", () => {
  const mockNow = new Date("2026-10-27T12:00:00.000Z");

  const sampleIssue = {
    id: "bug-1",
    title: "Fix latency bug",
    number: 101,
    tenantId: "tenant-zedu",
    projectId: "proj-web",
    reporterId: "user-reporter",
    severity: "high",
    voteCount: 5,
  };

  const sampleBidA = {
    id: "bid-a",
    bugId: "bug-1",
    agentId: "agent-a",
    beneficiaryUserId: "user-a",
    createdAt: new Date("2026-10-27T10:00:00.000Z"),
    agent: {
      id: "agent-a",
      name: "AlphaAgent",
      ownerUserId: "user-a",
      revokedAt: null,
    },
    beneficiary: {
      id: "user-a",
      name: "Alice",
    },
  };

  const sampleBidB = {
    id: "bid-b",
    bugId: "bug-1",
    agentId: "agent-b",
    beneficiaryUserId: "user-b",
    createdAt: new Date("2026-10-27T10:05:00.000Z"),
    agent: {
      id: "agent-b",
      name: "BetaAgent",
      ownerUserId: "user-b",
      revokedAt: null,
    },
    beneficiary: {
      id: "user-b",
      name: "Bob",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfirmed.mockResolvedValue(true);
    mockWorkflowFor.mockResolvedValue({
      offerWindowSeconds: 1800,
      maxActiveClaims: 2,
    });
    mockBugActivityCreate.mockResolvedValue({ id: "activity-1" });
    mockCommentCreate.mockImplementation(async ({ data }) => ({
      id: "comment-new",
      ...data,
      createdAt: mockNow,
    }));
    mockCommentUpdate.mockResolvedValue({ id: "comment-updated" });
    mockPublish.mockResolvedValue(undefined);
  });

  describe("Turn 1: Selection and Go-Ahead Invitation", () => {
    it("selects the bidder fairly (prioritizing fewest active claims) and posts a go-ahead comment", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([]); // No existing go-ahead comments
      mockIssueBidFindMany.mockResolvedValue([sampleBidA, sampleBidB]);

      // Alice (Bid A) already has 1 active task; Bob (Bid B) has 0 active tasks
      mockIssueClaimCount.mockImplementation(async ({ where }) => {
        if (where.beneficiaryUserId === "user-a" && where.status === "active" && where.releasedAt === null) {
          return 1;
        }
        return 0;
      });

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.invited).toBe(1);
      expect(res.assigned).toBe(0);

      // Fair algorithm should have selected Bob (BetaAgent) with 0 active tasks over Alice with 1 active task
      expect(mockCommentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bugId: "bug-1",
          authorId: "user-reporter",
          body: expect.stringContaining('@[BetaAgent](BetaAgent): Go ahead! Please reply "I am ready to work"'),
          metadata: expect.objectContaining({
            action: "bid_go_ahead",
            bidId: "bid-b",
            agentId: "agent-b",
            agentName: "BetaAgent",
            resolved: false,
          }),
        }),
      });

      expect(mockBugActivityCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bugId: "bug-1",
          type: "commented",
        }),
      });
      expect(mockPublish).toHaveBeenCalled();
    });

    it("skips bidders who have reached maxActiveClaims limit", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([]);
      mockIssueBidFindMany.mockResolvedValue([sampleBidA, sampleBidB]);

      // Alice has reached maxActiveClaims (2); Bob has 0
      mockIssueClaimCount.mockImplementation(async ({ where }) => {
        if (where.beneficiaryUserId === "user-a" && where.releasedAt === null) return 2;
        return 0;
      });

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.invited).toBe(1);
      expect(mockCommentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining("BetaAgent"),
        }),
      });
    });

    it("prioritizes fewest historical tasks awarded when active claims are equal", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([]);
      mockIssueBidFindMany.mockResolvedValue([sampleBidA, sampleBidB]);

      // Both Alice and Bob have 0 active claims
      // Alice has 5 historical claims; Bob has 1 historical claim
      mockIssueClaimCount.mockImplementation(async ({ where }) => {
        if (where.status === "active") return 0;
        if (where.claimedAt && where.beneficiaryUserId === "user-a") return 5;
        if (where.claimedAt && where.beneficiaryUserId === "user-b") return 1;
        return 0;
      });

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.invited).toBe(1);
      expect(mockCommentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining("BetaAgent"),
        }),
      });
    });

    it("falls back to FIFO (earliest createdAt) when active and historical claims are equal", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([]);
      // sampleBidA was created at 10:00:00, sampleBidB was created at 10:05:00
      mockIssueBidFindMany.mockResolvedValue([sampleBidA, sampleBidB]);
      mockIssueClaimCount.mockResolvedValue(0);

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.invited).toBe(1);
      expect(mockCommentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining("AlphaAgent"),
        }),
      });
    });

    it("ignores bids from revoked agents", async () => {
      const revokedBidA = {
        ...sampleBidA,
        agent: { ...sampleBidA.agent, revokedAt: new Date("2026-10-26T00:00:00.000Z") },
      };
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([]);
      mockIssueBidFindMany.mockResolvedValue([revokedBidA, sampleBidB]);
      mockIssueClaimCount.mockResolvedValue(0);

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.invited).toBe(1);
      expect(mockCommentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining("BetaAgent"),
        }),
      });
    });
  });

  describe("Turn 2: Response Detection and Assignment", () => {
    const existingGoAhead = {
      id: "comment-go-ahead",
      bugId: "bug-1",
      authorId: "user-reporter",
      body: '@[BetaAgent](BetaAgent): Go ahead! Please reply "I am ready to work"',
      createdAt: new Date("2026-10-27T11:45:00.000Z"),
      metadata: {
        action: "bid_go_ahead",
        bidId: "bid-b",
        agentId: "agent-b",
        beneficiaryUserId: "user-b",
        agentName: "BetaAgent",
        resolved: false,
      },
    };

    it("assigns the task when the selected bidder replied 'I am ready to work'", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([existingGoAhead]);
      mockIssueBidFindUnique.mockResolvedValue({
        id: "bid-b",
        awardedAt: null,
        withdrawnAt: null,
      });

      // The selected bidder replied with "I am ready to work"
      mockCommentFindFirst.mockResolvedValue({
        id: "reply-1",
        bugId: "bug-1",
        agentId: "agent-b",
        authorId: "user-b",
        body: "I am ready to work",
        createdAt: new Date("2026-10-27T11:50:00.000Z"),
      });

      mockAwardBid.mockResolvedValue({
        bidId: "bid-b",
        claimId: "claim-new",
        bugId: "bug-1",
      });

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.assigned).toBe(1);
      expect(mockAwardBid).toHaveBeenCalledWith(
        { id: "user-reporter", role: "super_admin" },
        "bid-b",
      );

      // Verify go-ahead comment was marked resolved
      expect(mockCommentUpdate).toHaveBeenCalledWith({
        where: { id: "comment-go-ahead" },
        data: {
          metadata: expect.objectContaining({
            resolved: true,
            assignedAt: mockNow.toISOString(),
          }),
        },
      });

      // Verify confirmation comment was posted
      expect(mockCommentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining("Confirmed! Issue assigned to @[BetaAgent](BetaAgent)."),
          metadata: expect.objectContaining({
            action: "bid_assigned",
            bidId: "bid-b",
          }),
        }),
      });
    });

    it("waits if bidder has not replied yet but response window is still open", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([existingGoAhead]); // 15 mins ago, window is 30 mins
      mockCommentFindFirst.mockResolvedValue(null); // No reply yet

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.assigned).toBe(0);
      expect(res.invited).toBe(0);
      expect(res.lapsed).toBe(0);
      expect(mockAwardBid).not.toHaveBeenCalled();
    });

    it("marks invitation lapsed and invites next bidder if response window expired", async () => {
      const expiredGoAhead = {
        ...existingGoAhead,
        createdAt: new Date("2026-10-27T11:00:00.000Z"), // 60 mins ago, window is 30 mins
      };

      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([expiredGoAhead]);
      mockCommentFindFirst.mockResolvedValue(null); // No reply
      mockIssueBidFindMany.mockResolvedValue([sampleBidA, sampleBidB]);
      mockIssueClaimCount.mockResolvedValue(0);

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.lapsed).toBe(1);
      // Selected bidder B lapsed, so next bidder A is invited!
      expect(res.invited).toBe(1);

      // Verify expiration comment was marked lapsed
      expect(mockCommentUpdate).toHaveBeenCalledWith({
        where: { id: "comment-go-ahead" },
        data: {
          metadata: expect.objectContaining({
            resolved: true,
            lapsed: true,
          }),
        },
      });

      // Verify AlphaAgent was invited on the same run after BetaAgent lapsed
      expect(mockCommentCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining("AlphaAgent"),
        }),
      });
    });

    it("assigns when the human beneficiary (agent owner) comments back instead of agent API", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([existingGoAhead]);
      mockIssueBidFindUnique.mockResolvedValue({
        id: "bid-b",
        awardedAt: null,
        withdrawnAt: null,
      });

      // Human owner commented back directly
      mockCommentFindFirst.mockResolvedValue({
        id: "reply-human",
        bugId: "bug-1",
        agentId: null,
        authorId: "user-b", // beneficiaryUserId
        body: "Ready to take this!",
        createdAt: new Date("2026-10-27T11:52:00.000Z"),
      });

      mockAwardBid.mockResolvedValue({
        bidId: "bid-b",
        claimId: "claim-new",
        bugId: "bug-1",
      });

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.assigned).toBe(1);
      expect(mockAwardBid).toHaveBeenCalledWith(
        { id: "user-reporter", role: "super_admin" },
        "bid-b",
      );
    });

    it("records errors in result.errors when awardBid throws, without crashing the sweep", async () => {
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([existingGoAhead]);
      mockIssueBidFindUnique.mockResolvedValue({
        id: "bid-b",
        awardedAt: null,
        withdrawnAt: null,
      });

      mockCommentFindFirst.mockResolvedValue({
        id: "reply-1",
        bugId: "bug-1",
        agentId: "agent-b",
        authorId: "user-b",
        body: "I am ready to work",
        createdAt: new Date("2026-10-27T11:50:00.000Z"),
      });

      mockAwardBid.mockRejectedValueOnce(new Error("Database deadlock during award"));

      const res = await sweepPendingBids({ now: mockNow });

      expect(res.assigned).toBe(0);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toEqual({
        issueId: "bug-1",
        error: "Database deadlock during award",
      });
    });
  });

  describe("Full Two-Turn Handshake Lifecycle Simulation", () => {
    it("completes Turn 1 invitation followed by Turn 2 confirmation and assignment", async () => {
      // --- Turn 1: Issue has 2 bids, unassigned. Cron runs ---
      mockBugFindMany.mockResolvedValue([sampleIssue]);
      mockCommentFindMany.mockResolvedValue([]); // No existing comments
      mockIssueBidFindMany.mockResolvedValue([sampleBidA, sampleBidB]);
      mockIssueClaimCount.mockResolvedValue(0);

      // In-memory comment store to simulate database persistence across turns
      type StoredComment = {
        id: string;
        bugId: string;
        authorId: string;
        agentId?: string | null;
        body: string;
        type?: string;
        createdAt: Date;
        metadata?: Record<string, unknown> | null;
      };
      const commentStore: StoredComment[] = [];

      mockCommentCreate.mockImplementation(async ({ data }) => {
        const item: StoredComment = {
          id: `comment-${commentStore.length + 1}`,
          ...data,
          createdAt: new Date("2026-10-27T12:00:00.000Z"),
        };
        commentStore.push(item);
        return item;
      });

      mockCommentUpdate.mockImplementation(async ({ where, data }) => {
        const item = commentStore.find((c) => c.id === where.id);
        if (item) {
          Object.assign(item, data);
        }
        return item;
      });

      mockCommentFindMany.mockImplementation(async () => [...commentStore].reverse());
      mockCommentFindFirst.mockImplementation(async ({ where }) => {
        return (
          commentStore.find((c) => {
            if (c.bugId !== where.bugId) return false;
            if (where.createdAt?.gt && c.createdAt <= where.createdAt.gt) return false;
            if (where.OR) {
              return (where.OR as Array<{ agentId?: string; authorId?: string }>).some(
                (clause) =>
                  (clause.agentId && c.agentId === clause.agentId) ||
                  (clause.authorId && c.authorId === clause.authorId),
              );
            }
            return true;
          }) ?? null
        );
      });

      mockIssueBidFindUnique.mockImplementation(async ({ where }) => {
        const b = [sampleBidA, sampleBidB].find((bid) => bid.id === where.id);
        return b ? { id: b.id, awardedAt: null, withdrawnAt: null } : null;
      });

      mockAwardBid.mockResolvedValue({
        bidId: "bid-a",
        claimId: "claim-1",
        bugId: "bug-1",
      });

      // 1. Run Turn 1 of sweep
      const turn1Result = await sweepPendingBids({
        now: new Date("2026-10-27T12:00:00.000Z"),
      });

      expect(turn1Result.invited).toBe(1);
      expect(turn1Result.assigned).toBe(0);
      expect(commentStore).toHaveLength(1);
      expect(commentStore[0].body).toContain('@[AlphaAgent](AlphaAgent): Go ahead! Please reply "I am ready to work"');
      expect(commentStore[0]?.metadata?.resolved).toBe(false);

      // 2. Simulate AlphaAgent commenting "I am ready to work"
      commentStore.push({
        id: "comment-agent-reply",
        bugId: "bug-1",
        authorId: "user-a",
        agentId: "agent-a",
        body: "I am ready to work",
        type: "comment",
        createdAt: new Date("2026-10-27T12:05:00.000Z"),
      });

      // 3. Run Turn 2 of sweep
      const turn2Result = await sweepPendingBids({
        now: new Date("2026-10-27T12:06:00.000Z"),
      });

      expect(turn2Result.assigned).toBe(1);
      expect(mockAwardBid).toHaveBeenCalledWith(
        { id: "user-reporter", role: "super_admin" },
        "bid-a",
      );

      // Verify the invitation comment was marked resolved
      expect(commentStore[0]?.metadata?.resolved).toBe(true);

      // Verify the confirmation comment was added
      const confirmation = commentStore.find((c) => c.metadata?.action === "bid_assigned");
      expect(confirmation).toBeDefined();
      expect(confirmation?.body).toContain("Confirmed! Issue assigned to @[AlphaAgent](AlphaAgent).");
    });
  });
});
