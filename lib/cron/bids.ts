import { prisma } from "@/lib/prisma";
import { awardBid } from "@/lib/agent-api/bid";
import { isConfirmed } from "@/lib/agent-api/validation";
import { workflowFor } from "@/lib/workflow";
import { WORK_READINESS_VOTE_THRESHOLD } from "@/lib/ticket-assignment";
import { commentedSummary } from "@/lib/activity-log";
import { publish } from "@/lib/agent-api/events";
import { logger } from "@/lib/logger";

export type BidSweepResult = {
  invited: number;
  assigned: number;
  lapsed: number;
  errors: Array<{ issueId: string; error: string }>;
};

type GoAheadMetadata = {
  action?: string;
  bidId?: string;
  agentId?: string;
  beneficiaryUserId?: string;
  agentName?: string;
  selectedAt?: string;
  resolved?: boolean;
  lapsed?: boolean;
};

/**
 * Fair Bid Auto-Assignment Sweep
 *
 * Automatically assigns open bids on confirmed issues through a fair two-turn handshake:
 *
 * Turn 1:
 * - Scans for open, confirmed issues with pending bids and no active assignee/claim.
 * - Selects a bidder fairly so all agents and contributors have a fair chance at tasks:
 *     1. Prioritizes bidders with fewest active claims (workload balancing).
 *     2. Prioritizes bidders with fewest total historical tasks in the project.
 *     3. Uses earliest bid creation time as tie-breaker.
 * - Posts a "go ahead" comment to the selected bidder asking them to confirm:
 *     "@[agent]: Go ahead! Please reply 'I am ready to work' or comment back to confirm you are ready to take this task."
 *
 * Turn 2:
 * - Inspects pending "go ahead" comments on subsequent cron runs.
 * - If the selected bidder (agent or beneficiary user) has commented back:
 *     Officially awards the bid and assigns the task to that agent.
 * - If the response window has expired without a reply:
 *     Marks the invitation lapsed and frees the issue for the next bidder.
 */
export async function sweepPendingBids(options?: {
  now?: Date;
  responseWindowMs?: number;
  limit?: number;
}): Promise<BidSweepResult> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 50;

  const result: BidSweepResult = {
    invited: 0,
    assigned: 0,
    lapsed: 0,
    errors: [],
  };

  // Find candidate issues: open, confirmed, unassigned, with pending bids and no live claim
  const candidateIssues = await prisma.bug.findMany({
    where: {
      status: "open",
      isDeleted: false,
      assigneeId: null,
      voteCount: { gte: WORK_READINESS_VOTE_THRESHOLD },
      claims: {
        none: {
          releasedAt: null,
          OR: [{ status: "active" }, { status: "offered" }],
        },
      },
      bids: {
        some: {
          withdrawnAt: null,
          awardedAt: null,
        },
      },
    },
    select: {
      id: true,
      title: true,
      number: true,
      tenantId: true,
      projectId: true,
      reporterId: true,
      severity: true,
      voteCount: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  for (const issue of candidateIssues) {
    try {
      if (!(await isConfirmed(issue.id))) continue;

      const workflow = await workflowFor(issue.projectId);
      const responseWindowMs =
        options?.responseWindowMs ?? workflow.offerWindowSeconds * 1000;

      // Check for any existing "go ahead" comments on this issue
      const recentComments = await prisma.comment.findMany({
        where: {
          bugId: issue.id,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      // Identify bids that previously lapsed on this issue
      const lapsedBidIds = new Set<string>();
      for (const comment of recentComments) {
        const cMeta = comment.metadata as { action?: string; bidId?: string } | null;
        if (cMeta?.action === "bid_lapsed" && cMeta.bidId) {
          lapsedBidIds.add(cMeta.bidId);
        }
      }

      const goAheadComment = recentComments.find(
        (c) => (c.metadata as GoAheadMetadata | null)?.action === "bid_go_ahead",
      );

      const meta = (goAheadComment?.metadata ?? null) as GoAheadMetadata | null;

      // ---------------------------------------------------------------------
      // Turn 2: Existing pending invitation
      // ---------------------------------------------------------------------
      if (goAheadComment && meta && !meta.resolved) {
        // Look for any comment from the selected bidder after the invitation
        const bidderReply = await prisma.comment.findFirst({
          where: {
            bugId: issue.id,
            deletedAt: null,
            createdAt: { gt: goAheadComment.createdAt },
            OR: [
              ...(meta.agentId ? [{ agentId: meta.agentId }] : []),
              ...(meta.beneficiaryUserId ? [{ authorId: meta.beneficiaryUserId }] : []),
            ],
          },
          orderBy: { createdAt: "asc" },
        });

        if (bidderReply) {
          // The bidder commented back! Assign the task to this agent.
          if (meta.bidId) {
            const bid = await prisma.issueBid.findUnique({
              where: { id: meta.bidId },
              select: { id: true, awardedAt: true, withdrawnAt: true },
            });

            if (bid && !bid.awardedAt && !bid.withdrawnAt) {
              await awardBid(
                { id: issue.reporterId ?? meta.beneficiaryUserId ?? "system", role: "super_admin" },
                meta.bidId,
              );

              // Mark the invitation as resolved
              await prisma.comment.update({
                where: { id: goAheadComment.id },
                data: {
                  metadata: {
                    ...meta,
                    resolved: true,
                    assignedAt: now.toISOString(),
                  },
                },
              });

              // Post confirmation comment
              const confirmText = `Confirmed! Issue assigned to @[${meta.agentName ?? "agent"}](${meta.agentName ?? "agent"}).`;
              const authorId = issue.reporterId ?? meta.beneficiaryUserId ?? "system";

              const confirmComment = await prisma.comment.create({
                data: {
                  bugId: issue.id,
                  authorId,
                  body: confirmText,
                  type: "comment",
                  metadata: {
                    action: "bid_assigned",
                    bidId: meta.bidId,
                    agentId: meta.agentId,
                    beneficiaryUserId: meta.beneficiaryUserId,
                  },
                },
              });

              await prisma.bugActivity.create({
                data: {
                  bugId: issue.id,
                  actorId: authorId,
                  type: "commented",
                  summary: commentedSummary(confirmText),
                  metadata: { commentId: confirmComment.id, action: "bid_assigned" },
                },
              });

              await publish(prisma, {
                tenantId: issue.tenantId,
                type: "comment.created",
                bugId: issue.id,
                payload: { commentId: confirmComment.id, issueId: issue.id, authorId },
              });

              result.assigned++;
              continue;
            }
          }
        }

        // Has the response window expired?
        const elapsedMs = now.getTime() - goAheadComment.createdAt.getTime();
        if (elapsedMs < responseWindowMs) {
          // Still waiting for bidder response within allowed window
          continue;
        }

        // Window expired without reply: mark lapsed so another bidder gets a chance
        await prisma.comment.update({
          where: { id: goAheadComment.id },
          data: {
            metadata: {
              ...meta,
              resolved: true,
              lapsed: true,
              lapsedAt: now.toISOString(),
            },
          },
        });
        if (meta.bidId) {
          lapsedBidIds.add(meta.bidId);
        }

        const lapseText = `Response window expired for @[${meta.agentName ?? "agent"}](${meta.agentName ?? "agent"}). Giving another bidder a fair chance.`;
        const authorId = issue.reporterId ?? meta.beneficiaryUserId ?? "system";

        const lapseComment = await prisma.comment.create({
          data: {
            bugId: issue.id,
            authorId,
            body: lapseText,
            type: "comment",
            metadata: {
              action: "bid_lapsed",
              bidId: meta.bidId,
              agentId: meta.agentId,
            },
          },
        });

        await prisma.bugActivity.create({
          data: {
            bugId: issue.id,
            actorId: authorId,
            type: "commented",
            summary: commentedSummary(lapseText),
            metadata: { commentId: lapseComment.id, action: "bid_lapsed" },
          },
        });

        await publish(prisma, {
          tenantId: issue.tenantId,
          type: "comment.created",
          bugId: issue.id,
          payload: { commentId: lapseComment.id, issueId: issue.id, authorId },
        });

        result.lapsed++;
      }

      // ---------------------------------------------------------------------
      // Turn 1: Select a bidder fairly and post "go ahead" comment
      // ---------------------------------------------------------------------
      const openBids = await prisma.issueBid.findMany({
        where: {
          bugId: issue.id,
          withdrawnAt: null,
          awardedAt: null,
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              ownerUserId: true,
              revokedAt: true,
            },
          },
          beneficiary: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      if (openBids.length === 0) continue;

      // Build fairness candidate list
      const candidateBidders = [];
      for (const bid of openBids) {
        if (bid.agent.revokedAt) continue;

        // Active claims check for this bidder's beneficiary in this project
        const activeClaimsCount = await prisma.issueClaim.count({
          where: {
            beneficiaryUserId: bid.beneficiaryUserId,
            status: "active",
            releasedAt: null,
            bug: { tenantId: issue.tenantId, projectId: issue.projectId },
          },
        });

        if (activeClaimsCount >= workflow.maxActiveClaims) continue;

        // Total historical tasks awarded in this project
        const totalAwardedClaimsCount = await prisma.issueClaim.count({
          where: {
            beneficiaryUserId: bid.beneficiaryUserId,
            claimedAt: { not: null },
            bug: { tenantId: issue.tenantId, projectId: issue.projectId },
          },
        });

        candidateBidders.push({
          bid,
          activeClaimsCount,
          totalAwardedClaimsCount,
          hasLapsed: lapsedBidIds.has(bid.id),
        });
      }

      if (candidateBidders.length === 0) continue;

      // Fairness sorting:
      // 1. Unlapsed bidders before lapsed bidders
      // 2. Fewest current active tasks (workload balancing)
      // 3. Fewest historical tasks awarded in project (fair opportunity)
      // 4. Earliest bid createdAt (FIFO)
      candidateBidders.sort((a, b) => {
        if (a.hasLapsed !== b.hasLapsed) return a.hasLapsed ? 1 : -1;
        if (a.activeClaimsCount !== b.activeClaimsCount) {
          return a.activeClaimsCount - b.activeClaimsCount;
        }
        if (a.totalAwardedClaimsCount !== b.totalAwardedClaimsCount) {
          return a.totalAwardedClaimsCount - b.totalAwardedClaimsCount;
        }
        return a.bid.createdAt.getTime() - b.bid.createdAt.getTime();
      });

      const selected = candidateBidders[0].bid;
      const agentName = selected.agent.name;
      const authorId = issue.reporterId ?? selected.beneficiaryUserId;
      const goAheadBody = `@[${agentName}](${agentName}): Go ahead! Please reply "I am ready to work" or comment back to confirm you are ready to take this task.`;

      const comment = await prisma.comment.create({
        data: {
          bugId: issue.id,
          authorId,
          body: goAheadBody,
          type: "comment",
          metadata: {
            action: "bid_go_ahead",
            bidId: selected.id,
            agentId: selected.agentId,
            beneficiaryUserId: selected.beneficiaryUserId,
            agentName,
            selectedAt: now.toISOString(),
            resolved: false,
          },
        },
      });

      await prisma.bugActivity.create({
        data: {
          bugId: issue.id,
          actorId: authorId,
          type: "commented",
          summary: commentedSummary(goAheadBody),
          metadata: { commentId: comment.id, action: "bid_go_ahead" },
        },
      });

      await publish(prisma, {
        tenantId: issue.tenantId,
        type: "comment.created",
        bugId: issue.id,
        payload: { commentId: comment.id, issueId: issue.id, authorId },
      });

      result.invited++;
    } catch (error) {
      logger.error(`[cron] Error processing bids for issue ${issue.id}:`, error);
      result.errors.push({
        issueId: issue.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
