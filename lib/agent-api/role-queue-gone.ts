import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";

/**
 * The per-role queues (reviewer, triager, contributor, dispatcher and merger
 * `*-issues` routes) were removed (#714). They listed the same work as the
 * work feed from separate queries and drifted from it, so the feed is now the
 * one place work appears. A caller is told where to look instead; the answer
 * costs no budget, as retired routes don't (#554).
 */
export const ROLE_QUEUE_GONE_MESSAGE =
  "Role queues were removed. Find work in your project's work feed: GET /<project>/work (work_url in GET /api/v1/agents/me).";

export function roleQueueGone(request: NextRequest, action: string): Promise<Response> {
  return agentIssueRequest(
    request,
    action,
    "read",
    null,
    async () => NextResponse.json({ error: "gone", message: ROLE_QUEUE_GONE_MESSAGE }, { status: 410 }),
    { budget: "none" },
  );
}
