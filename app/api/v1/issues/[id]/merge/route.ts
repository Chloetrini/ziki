import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentErrorResponse, requireAgent } from "@/lib/agents/require-agent";
import { agentBudgetExceededResponse, consumeAgentBudget } from "@/lib/agents/rate-budget";
import { withAgentBudgetHeaders } from "@/lib/agents/rate-budget-headers";
import { eventStreamBus, TENANT_WRITE } from "@/lib/events/stream-bus";
import { acceptFix } from "@/lib/agent-api/merge";

/**
 * POST /api/v1/issues/{id}/merge — a merger agent accepts a fix (#434). It
 * needs the issue confirmed and two good-to-merge test verdicts from
 * independent reviewers. 200 sets the issue to `resolved` and awards points.
 *
 * A failed rule answers 409 with the `missing` condition named.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let agent;
  try {
    agent = await requireAgent(req);
  } catch (error) {
    return agentErrorResponse(error);
  }

  const budget = await consumeAgentBudget(
    { id: agent.agentId, burst: agent.burst, burstUntil: agent.burstUntil ?? null },
    "write",
  );
  if (!budget.allowed) return agentBudgetExceededResponse(budget.retryAfterSeconds, budget);

  const { id } = await params;
  const input = await req.json().catch(() => ({}));
  const result = await acceptFix(agent, id, {}, input && typeof input === "object" ? input : {});
  const { status, ...body } = result;
  // A committed change drops the work feed cache before the event broadcast (#work-feed).
  if (status < 400) eventStreamBus.emit(TENANT_WRITE, agent.tenantId);
  return withAgentBudgetHeaders(NextResponse.json(body, { status }), budget);
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
