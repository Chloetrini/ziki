import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueProject, listAgentIssues } from "@/lib/agent-api/issues";

/** GET ?projectId=&status=&severity=&platform=&area=&assignee=&stage=&cursor=&limit= */
export async function GET(request: NextRequest) {
  return agentIssueRequest(request, "issues.list", "read", null, async (agent) => {
    const scope = await issueProject(agent, request.nextUrl.searchParams);
    return NextResponse.json(await listAgentIssues(scope, request.nextUrl.searchParams));
  });
}

/**
 * Issues are never filed directly (#idea-table): every report is an idea
 * (`POST /api/v1/ideas`), and converting the idea creates the issue.
 */
export async function POST() {
  const message = "Issues are made by converting an idea. File a report with POST /api/v1/ideas.";
  return NextResponse.json({ error: message, code: "use_ideas", message }, { status: 410 });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "POST", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "POST", "OPTIONS"]);
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
