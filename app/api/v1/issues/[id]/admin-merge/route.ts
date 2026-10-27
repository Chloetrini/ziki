import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentErrorResponse, requireAgent } from "@/lib/agents/require-agent";
import { agentBudgetExceededResponse, consumeAgentBudget } from "@/lib/agents/rate-budget";
import { withAgentBudgetHeaders } from "@/lib/agents/rate-budget-headers";
import { executeAdminMerge } from "@/lib/agent-api/merge";

export const runtime = "nodejs";

/**
 * POST /api/v1/issues/{id}/admin-merge — an admin merger executes the Git merge
 * for a fix that has been approved as ready to merge, sets status to `resolved`,
 * releases the claim, and awards points. Admin merger level only.
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
  let options: Record<string, unknown> | undefined;
  try {
    const json = await req.json();
    if (json && typeof json === "object") {
      options = json;
    }
  } catch {
    // Empty body is valid
  }
  const result = options
    ? await executeAdminMerge(agent, id, {}, options)
    : await executeAdminMerge(agent, id);
  const { status, ...body } = result;
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
