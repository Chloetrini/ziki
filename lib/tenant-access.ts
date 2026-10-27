import { cache } from "react";
import type { MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isOrganizationAdmin, type OrganizationRole } from "@/lib/organization-role";
import { isSuperAdmin, type AppRole } from "@/lib/roles";
import { currentTenantIdFor } from "@/lib/tenant-context";

/**
 * Whether the signed-in person may administer one organization.
 *
 * The answer comes from their membership in that organization. The site-wide
 * admin role is not consulted, except for the site super admin, who can
 * administer every organization and acts as owner.
 */

export type TenantAccess = {
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  membershipRole: OrganizationRole | null;
  admin: boolean;
};

function accessFrom(
  tenantId: string | null,
  membership: { role: MembershipRole; tenant: { name: string; slug: string } } | null,
  appRole: AppRole | null | undefined,
): TenantAccess {
  const isSuper = isSuperAdmin(appRole);
  return {
    tenantId,
    tenantName: membership?.tenant.name ?? null,
    tenantSlug: membership?.tenant.slug ?? null,
    membershipRole: !tenantId ? null : isSuper ? "owner" : (membership?.role ?? null),
    admin: isSuper || isOrganizationAdmin(membership?.role, appRole),
  };
}

/** Membership in a known organization. */
export const tenantAccessFor = cache(async (
  userId: string,
  tenantId: string | null,
  appRole: AppRole | null | undefined,
): Promise<TenantAccess> => {
  if (!userId || !tenantId) return accessFrom(tenantId, null, appRole);
  try {
    const membership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true, tenant: { select: { name: true, slug: true } } },
    });
    return accessFrom(tenantId, membership, appRole);
  } catch (error) {
    console.error("[tenant-access] tenantAccessFor failed", error);
    return accessFrom(tenantId, null, appRole);
  }
});

/** Membership in the organization this device is working in. */
export const currentTenantAccess = cache(async (
  userId: string,
  appRole: AppRole | null | undefined,
): Promise<TenantAccess> => {
  const tenantId = await currentTenantIdFor(userId);
  return tenantAccessFor(userId, tenantId, appRole);
});
