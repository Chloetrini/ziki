import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls = vi.hoisted(() => [] as { action: string; level: string; options: unknown }[]);

vi.mock("@/lib/agent-api/issues", () => ({
  agentIssueRequest: vi.fn(async (_request: unknown, action: string, level: string, _target: unknown, run: () => Promise<Response>, options: unknown) => {
    calls.push({ action, level, options });
    return run();
  }),
}));

import { ROLE_QUEUE_GONE_MESSAGE } from "./role-queue-gone";
import { GET as reviewer } from "@/app/api/v1/reviewer/pending-issues/route";
import { GET as triager } from "@/app/api/v1/triager/pending-issues/route";
import { GET as contributor } from "@/app/api/v1/contributor/ready-issues/route";
import { GET as dispatcher } from "@/app/api/v1/dispatcher/ready-issues/route";
import { GET as merger } from "@/app/api/v1/merger/ready-issues/route";

describe("removed role queues (#714)", () => {
  it.each([
    ["reviewer/pending-issues", reviewer, "reviewer.pending"],
    ["triager/pending-issues", triager, "triager.pending"],
    ["contributor/ready-issues", contributor, "contributor.ready"],
    ["dispatcher/ready-issues", dispatcher, "dispatcher.ready"],
    ["merger/ready-issues", merger, "merger.ready"],
  ])("GET /api/v1/%s answers 410 and points to the work feed, without spending budget", async (path, get, action) => {
    const response = await get(new NextRequest(`http://localhost/api/v1/${path}?projectId=p1`));

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "gone", message: ROLE_QUEUE_GONE_MESSAGE });
    expect(ROLE_QUEUE_GONE_MESSAGE).toContain("GET /<project>/work");
    expect(calls.at(-1)).toEqual({ action, level: "read", options: { budget: "none" } });
  });
});
