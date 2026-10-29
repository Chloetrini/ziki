import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { notification: { findMany: vi.fn() } } }));
vi.mock("@/lib/cache-tags", () => ({ expireTag: vi.fn(), TAGS: {} }));
vi.mock("@/lib/tenant-context", () => ({
  currentTenantIdFor: vi.fn(),
  notificationInTenant: vi.fn(() => ({ OR: [{ tenantId: null }, { tenantId: "t1" }, { kind: "tenant_invite" }] })),
}));

import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor, notificationInTenant } from "@/lib/tenant-context";
import { recentNotificationsAction } from "./notifications";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(currentTenantIdFor).mockResolvedValue("t1");
  vi.mocked(prisma.notification.findMany).mockResolvedValue([]);
});

describe("recentNotificationsAction", () => {
  it("returns only eight recent summaries for the authenticated user's workspace feed", async () => {
    expect(await recentNotificationsAction()).toEqual([]);
    expect(currentTenantIdFor).toHaveBeenCalledWith("u1");
    expect(notificationInTenant).toHaveBeenCalledWith("t1");
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", OR: [{ tenantId: null }, { tenantId: "t1" }, { kind: "tenant_invite" }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 8,
      select: { id: true, title: true, readAt: true, createdAt: true },
    });
  });

  it("does not query notifications when unauthenticated", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("unauthenticated"));
    await expect(recentNotificationsAction()).rejects.toThrow("unauthenticated");
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it("propagates database errors for the preview's retry state", async () => {
    vi.mocked(prisma.notification.findMany).mockRejectedValue(new Error("unavailable"));
    await expect(recentNotificationsAction()).rejects.toThrow("unavailable");
  });
});
