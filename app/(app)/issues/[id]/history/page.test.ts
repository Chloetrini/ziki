import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-context")>()),
  currentTenantIdFor: vi.fn(async () => "tenant-zedu"),
}));
vi.mock("@/lib/tenant-access", () => ({
  currentTenantAccess: vi.fn(async () => ({ tenantId: "tenant-zedu", membershipRole: "member", admin: false })),
}));
vi.mock("@/lib/auth-helpers", () => ({
  requireUser: vi.fn(async () => ({ id: "user-123", role: "user" })),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { bug: { findUnique: vi.fn(), findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import IssueHistoryPage from "./page";

describe("issue history readable addresses (#457)", () => {
  beforeEach(() => {
    vi.mocked(prisma.bug.findUnique).mockReset();
  });

  it("redirects an old internal-id link to the numbered history, keeping the query", async () => {
    vi.mocked(prisma.bug.findUnique).mockResolvedValueOnce({ id: "cmlegacy0001", number: 7 } as never);
    await expect(
      IssueHistoryPage({
        params: Promise.resolve({ id: "cmlegacy0001" }),
        searchParams: Promise.resolve({ from: "email", tag: ["a", "b"] }),
      }),
    ).rejects.toThrow("REDIRECT /issues/7/history?from=email&tag=a&tag=b");
  });

  it("redirects without a trailing ? when there is no query", async () => {
    vi.mocked(prisma.bug.findUnique).mockResolvedValueOnce({ id: "cmlegacy0001", number: 7 } as never);
    await expect(
      IssueHistoryPage({ params: Promise.resolve({ id: "cmlegacy0001" }) }),
    ).rejects.toThrow(/^REDIRECT \/issues\/7\/history$/);
  });
});
