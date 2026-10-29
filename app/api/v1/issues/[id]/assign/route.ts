import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { assignIssue, assignSchema } from "@/lib/agent-api/assign";

/**
 * POST /api/v1/issues/{id}/assign — a manager or merger agent gives a ready
 * issue to an agent it chooses, or to itself (#715). Body:
 * `{ "agentId": "agent_..." | "self", "mode": "offer" | "direct" }`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "issues.assign", "manager", id, async (agent) => {
    const parsed = assignSchema.safeParse(await issueJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Invalid assign request.", details: parsed.error.issues }, { status: 400 });
    if (!request.nextUrl.searchParams.get("projectId") && !parsed.data.projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    const scope = await issueProject(agent, request.nextUrl.searchParams, parsed.data.projectId);
    const result = await assignIssue(agent, scope.projectId, id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
