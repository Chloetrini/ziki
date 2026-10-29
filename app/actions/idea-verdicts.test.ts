import { beforeEach, describe, expect, it, vi } from "vitest";

const giveIdeaVerdict = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: vi.fn(async () => ({ id: "ada", role: "user" })) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  consumeRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/tenant-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-context")>()),
  currentTenantIdFor: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { bug: { findUnique } } }));
vi.mock("@/lib/agent-api/idea-verdicts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-api/idea-verdicts")>()),
  giveIdeaVerdict,
}));

import { IssueApiError } from "@/lib/agent-api/issues";
import { giveIdeaVerdictAction } from "./idea-verdicts";

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  const merged = { opinion: "good", summary: "Useful for new users.", description: "I hit this every week.", ...values };
  for (const [key, value] of Object.entries(merged)) data.set(key, value);
  return data;
}

describe("giveIdeaVerdictAction (#idea-verdicts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ id: "bug-1", projectId: "project-1", isDeleted: false });
    giveIdeaVerdict.mockResolvedValue({ replaced: false, ideaScore: 1, ideaThreshold: 3 });
  });

  it("gives the verdict as the person, with one vote, in their tenant", async () => {
    expect(await giveIdeaVerdictAction("bug-1", form())).toEqual({ ok: true, replaced: false, ideaScore: 1, ideaThreshold: 3 });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "bug-1", tenantId: "tenant-1" } }));
    expect(giveIdeaVerdict).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: "ada" }, "project-1", "bug-1", {
      opinion: "good",
      summary: "Useful for new users.",
      description: "I hit this every week.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/issues");
  });

  it("refuses an issue outside the tenant or deleted", async () => {
    findUnique.mockResolvedValue(null);
    expect(await giveIdeaVerdictAction("bug-1", form())).toEqual({ error: "Issue not found" });
    findUnique.mockResolvedValue({ id: "bug-1", projectId: "project-1", isDeleted: true });
    expect(await giveIdeaVerdictAction("bug-1", form())).toEqual({ error: "Issue not found" });
    expect(giveIdeaVerdict).not.toHaveBeenCalled();
  });

  it("asks for an opinion, a short summary and a description", async () => {
    expect(await giveIdeaVerdictAction("bug-1", form({ opinion: "great" }))).toEqual({ error: "Pick good, bad or neutral." });
    expect(await giveIdeaVerdictAction("bug-1", form({ summary: "One. Two. Three." }))).toEqual({
      error: "Keep the summary to two sentences.",
    });
    expect(await giveIdeaVerdictAction("bug-1", form({ description: "  " }))).toEqual({
      error: "Add a description explaining your verdict.",
    });
    expect(giveIdeaVerdict).not.toHaveBeenCalled();
  });

  it("ignores a votes field: a person always gives one vote", async () => {
    await giveIdeaVerdictAction("bug-1", form({ votes: "5" }));
    expect(giveIdeaVerdict.mock.calls[0][3]).not.toHaveProperty("votes");
  });

  it("shows the API's refusal, such as on your own idea", async () => {
    giveIdeaVerdict.mockRejectedValue(new IssueApiError(403, "You can't give a verdict on your own idea.", { error: "own_idea" }));
    expect(await giveIdeaVerdictAction("bug-1", form())).toEqual({ error: "You can't give a verdict on your own idea." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides unexpected errors behind a retry message", async () => {
    giveIdeaVerdict.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await giveIdeaVerdictAction("bug-1", form())).toEqual({ error: "Could not save your verdict. Please try again." });
  });
});
