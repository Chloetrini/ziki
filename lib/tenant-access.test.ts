import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const currentTenantIdFor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { membership: { findUnique } },
}));

vi.mock("@/lib/tenant-context", () => ({
  currentTenantIdFor,
}));

import { currentTenantAccess, tenantAccessFor } from "./tenant-access";

describe("tenant access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the membership role of the current organization", async () => {
    currentTenantIdFor.mockResolvedValue("tenant-ziki");
    findUnique.mockResolvedValue({
      role: "owner",
      tenant: { name: "Ziki", slug: "ziki" },
    });

    const access = await currentTenantAccess("ada", "user");

    expect(findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: "tenant-ziki", userId: "ada" } },
      select: { role: true, tenant: { select: { name: true, slug: true } } },
    });
    expect(access).toMatchObject({
      tenantId: "tenant-ziki",
      tenantName: "Ziki",
      membershipRole: "owner",
      admin: true,
    });
  });

  it("does not grant admin to a site admin who is only a member", async () => {
    findUnique.mockResolvedValue({
      role: "member",
      tenant: { name: "Ziki", slug: "ziki" },
    });

    const access = await tenantAccessFor("alice", "tenant-ziki", "admin");

    expect(access.admin).toBe(false);
    expect(access.membershipRole).toBe("member");
  });

  it("grants admin to the site super admin even with no membership", async () => {
    currentTenantIdFor.mockResolvedValue(null);

    const access = await currentTenantAccess("root", "super_admin");

    expect(findUnique).not.toHaveBeenCalled();
    expect(access).toMatchObject({ tenantId: null, admin: true, membershipRole: null });
  });

  it("grants owner membership role to the site super admin when tenant is selected", async () => {
    currentTenantIdFor.mockResolvedValue("tenant-ziki");
    findUnique.mockResolvedValue({
      role: "member",
      tenant: { name: "Ziki", slug: "ziki" },
    });

    const access = await currentTenantAccess("root", "super_admin");

    expect(access).toMatchObject({
      tenantId: "tenant-ziki",
      tenantName: "Ziki",
      membershipRole: "owner",
      admin: true,
    });
  });
});
