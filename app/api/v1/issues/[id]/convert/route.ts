import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { agentIssueRequest, issueJson, issueProject } from "@/lib/agent-api/issues";
import { convertIdea } from "@/lib/agent-api/idea-verdicts";

const convertSchema = z.object({ projectId: z.string().trim().min(1).max(191).optional() }).strict();

/**
 * POST /api/v1/issues/:id/convert — a manager or merger agent turns an idea
 * whose score reached the project's `ideaThreshold` into an issue
 * (#idea-verdicts), its owner's own ideas included. The issue then needs
 * confirming before work is offered.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "ideas.convert", "manager", id, async (agent) => {
    const input = convertSchema.parse(await issueJson(request));
    const scope = await issueProject(agent, request.nextUrl.searchParams, input.projectId);
    return NextResponse.json(await convertIdea(agent, scope.projectId, id));
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
