import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  agentIssueRequest: vi.fn(async (_req, _action, _level, _target, handler) => {
    return handler({
      agentId: "agent-1",
      name: "Agent One",
      tenantId: "tenant-1",
      ownerId: "user-1",
      level: "working",
      burst: false,
      keyId: "key-1",
    });
  }),
  issueJson: vi.fn(),
  issueProject: vi.fn(async () => ({ tenantId: "tenant-1", projectId: "proj-1" })),
  findIdea: vi.fn(),
  prisma: {
    idea: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (cb) => cb(mocks.prisma)),
  },
  audit: vi.fn(),
}));

vi.mock("@/lib/agent-api/issues", () => ({
  agentIssueRequest: mocks.agentIssueRequest,
  issueJson: mocks.issueJson,
  issueProject: mocks.issueProject,
}));
vi.mock("@/lib/agent-api/ideas", () => ({ findIdea: mocks.findIdea }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/agents/audit", () => ({ audit: mocks.audit }));

const draft = {
  id: "idea-1",
  number: 12,
  title: "Quick idea",
  description: "Allow users to download their activity data as CSV.",
  status: "open",
};

function post() {
  return POST(new NextRequest("http://localhost/api/v1/ideas/12/structure?projectId=proj-1", { method: "POST" }), {
    params: Promise.resolve({ id: "12" }),
  });
}

describe("POST /api/v1/ideas/[id]/structure (#idea-table)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findIdea.mockResolvedValue({ id: "idea-1" });
    mocks.prisma.idea.findUniqueOrThrow.mockResolvedValue(draft);
    mocks.prisma.idea.update.mockImplementation(async ({ data }) => ({ ...draft, ...data, updatedAt: new Date() }));
    mocks.issueJson.mockResolvedValue({
      summary: "CSV export for user activity data",
      problem: "Users cannot export their activity data.",
      proposedSolution: "Add a CSV export button on activity dashboard.",
      acceptanceCriteria: ["CSV export button works", "Data is downloaded properly"],
    });
  });

  it("structures an open draft idea, found by number in the project, and audits the text before", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(mocks.findIdea).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "proj-1" }, "12");
    const saved = mocks.prisma.idea.update.mock.calls[0][0];
    expect(saved.where).toEqual({ id: "idea-1" });
    expect(saved.data.description).toContain("## Summary");
    expect(saved.data.description).toContain("CSV export for user activity data");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1" }),
      "idea.structured",
      "idea:idea-1",
      expect.objectContaining({ beforeDescription: draft.description }),
      expect.anything(),
    );
    expect((await response.json()).idea).toMatchObject({ id: "idea-1", number: 12 });
  });

  it("refuses an idea that is not open, or not in the project", async () => {
    mocks.prisma.idea.findUniqueOrThrow.mockResolvedValueOnce({ ...draft, status: "converted" });
    await expect(post()).rejects.toMatchObject({ status: 400 });
    mocks.findIdea.mockResolvedValueOnce(null);
    await expect(post()).rejects.toMatchObject({ status: 404 });
    expect(mocks.prisma.idea.update).not.toHaveBeenCalled();
  });
});
