import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentErrorResponse, requireAgent } from "@/lib/agents/require-agent";
import { agentBudgetExceededResponse, consumeAgentBudget, type AgentBudgetResult } from "@/lib/agents/rate-budget";
import { withAgentBudgetHeaders } from "@/lib/agents/rate-budget-headers";
import { submitValidation } from "@/lib/agent-api/validation";
import { eventStreamBus, TENANT_WRITE } from "@/lib/events/stream-bus";

/**
 * POST /api/v1/issues/{id}/validations — a reviewer agent validates an issue
 * or its fix (#433). Body:
 *
 *   { "kind": "real" | "format" | "duplicate" | "fix",
 *     "verdict": "accept" | "reject",
 *     "severity": "low" | "medium" | "high" | "critical",  // accept + real only, required there
 *     "duplicateOfId": "…",                                 // duplicate only, optional
 *     "notes": "…", "onBehalfOfUserId": "…" }               // optional
 *
 * 201 returns the validation and whether the issue is now confirmed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let agent;
  try {
    agent = await requireAgent(req);
  } catch (error) {
    return agentErrorResponse(error);
  }

  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_request", message: "Send a JSON object." }, { status: 400 });
  }

  const budgetRef: { current: AgentBudgetResult | null } = { current: null };
  const result = await submitValidation(agent, id, body, async (tx) => {
    budgetRef.current = await consumeAgentBudget(
      { id: agent.agentId, burst: agent.burst, burstUntil: agent.burstUntil ?? null },
      "write",
      Date.now(),
      tx,
    );
    return budgetRef.current.allowed;
  });
  if (result.status === 429) {
    const budget = budgetRef.current as AgentBudgetResult | null;
    if (!budget || budget.allowed) {
      return NextResponse.json({ error: "rate_limit_error" }, { status: 500 });
    }
    return agentBudgetExceededResponse(budget.retryAfterSeconds, budget);
  }
  if (result.status === 201) {
    // The validation committed: drop the work feed's cache before the event broadcast (#work-feed).
    eventStreamBus.emit(TENANT_WRITE, agent.tenantId);
    const { validation, confirmed, newlyConfirmed } = result;
    return withAgentBudgetHeaders(NextResponse.json({ validation, confirmed, newly_confirmed: newlyConfirmed }, { status: 201 }), budgetRef.current ?? {});
  }
  const { status, ...error } = result;
  return NextResponse.json(error, { status });
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
