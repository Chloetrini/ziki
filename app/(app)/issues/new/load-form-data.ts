import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantAccess } from "@/lib/tenant-access";
import { getActiveIssueTypesCached, getActivePlatforms } from "@/lib/lookups";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { tenantMemberWhere } from "@/lib/tenant-mentions";
import { activeProjectIdFor } from "@/lib/project-context";

/**
 * Everything the report form needs, shared by the full page and the quick
 * report modal so both always load the same people, platforms and types.
 */
type MentionUser = { id: string; name: string; role: Role; image: string | null };

/** The issues list already survives a lookup failure. This form did not, so one bad read showed "This page didn't load". */
async function loadOrEmpty<T>(label: string, load: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[issues/new] ${label} lookup failed`, error);
    return empty;
  }
}

async function loadMentionUsers(tenantId: string | null): Promise<MentionUser[]> {
  // #502: only members of the tenant the issue goes into can be mentioned.
  if (!tenantId) return [];
  const where = tenantMemberWhere(tenantId);
  try {
    return await prisma.user.findMany({
      where,
      select: { id: true, name: true, role: true, image: true },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("[issues/new] user lookup failed, retrying without image", error);
    try {
      const rows = await prisma.user.findMany({
        where,
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({ ...row, image: null }));
    } catch (fallbackError) {
      console.error("[issues/new] user lookup failed", fallbackError);
      return [];
    }
  }
}

async function loadAssigneeUsers(tenantId: string | null): Promise<MentionUser[]> {
  if (!tenantId) return [];
  return loadOrEmpty("assignees", () =>
    prisma.user.findMany({
      where: { memberships: { some: { tenantId } } },
      select: { id: true, name: true, role: true, image: true },
      orderBy: { name: "asc" },
    }),
  []);
}

export async function loadReportFormData() {
  const user = await requireUser();
  const admin = (await currentTenantAccess(user.id, user.role)).admin;
  const tenantId = await currentTenantIdFor(user.id);
  const [users, assigneeUsers, categories, types] = await Promise.all([
    loadMentionUsers(tenantId),
    loadAssigneeUsers(tenantId),
    loadOrEmpty("platforms", async () => getActivePlatforms(tenantId), []),
    loadOrEmpty("issue types", () => getActiveIssueTypesCached(tenantId), []),
  ]);
  const projectId = await loadOrEmpty("active project", async () => {
    if (!tenantId) return null;
    return activeProjectIdFor(prisma, tenantId);
  }, null);
  return { user, admin, users, assigneeUsers, categories, types, projectId };
}
