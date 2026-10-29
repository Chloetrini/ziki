import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import type { NextRequest } from "next/server";
import { roleQueueGone } from "@/lib/agent-api/role-queue-gone";

export const runtime = "nodejs";

/**
 * GET /api/v1/triager/pending-issues — removed (#714). It listed issues needing a duplicate check; the
 * work feed (`GET /<project>/work`) lists that work now. Answers 410 Gone.
 */
export async function GET(request: NextRequest) {
  return roleQueueGone(request, "triager.pending");
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
