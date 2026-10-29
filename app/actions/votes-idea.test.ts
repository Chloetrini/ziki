import { beforeEach, describe, expect, it, vi } from "vitest";

/** #idea-verdicts: an idea takes verdicts, so the web upvote refuses it. */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/session-user", () => ({
  resolveSessionUserId: vi.fn(async () => ({ userId: "ada" })),
  SESSION_EXPIRED_MESSAGE: "Session expired",
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  consumeRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/tenant-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-context")>()),
  currentTenantIdFor: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bug: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { toggleVoteAction } from "./issues";

const findUnique = vi.mocked(prisma.bug.findUnique) as unknown as ReturnType<typeof vi.fn>;

describe("toggleVoteAction on an idea (#idea-verdicts)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to upvote an idea and says to give a verdict", async () => {
    findUnique.mockResolvedValue({ id: "bug-1", isDeleted: false, convertedToIssueAt: null });
    const result = await toggleVoteAction("bug-1", 1);
    expect(result.error).toMatch(/idea.*verdicts, not upvotes/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("asks for the conversion date with the issue", async () => {
    findUnique.mockResolvedValue({ id: "bug-1", isDeleted: false, convertedToIssueAt: null });
    await toggleVoteAction("bug-1", 1);
    expect(findUnique.mock.calls[0][0].select).toMatchObject({ convertedToIssueAt: true });
  });

  it("lets a converted issue through to the vote", async () => {
    findUnique.mockResolvedValue({ id: "bug-1", isDeleted: false, convertedToIssueAt: new Date() });
    vi.mocked(prisma.$transaction).mockResolvedValue({ voted: true, userVote: 1, voteCount: 1, likeCount: 1, dislikeCount: 0 } as never);
    expect(await toggleVoteAction("bug-1", 1)).toMatchObject({ ok: true, voted: true });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
