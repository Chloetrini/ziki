import { notFound, permanentRedirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { viewerBugScope } from "@/lib/tenant-viewer";
import { ideaPath, parseIssueRef, resolveIssueRef } from "@/lib/issue-ref";
import { canDeleteTicket } from "@/lib/ticket-deletion";
import { currentTenantAccess } from "@/lib/tenant-access";

/**
 * Decides 404 before anything streams (#291).
 *
 * This route has a loading.tsx, and a loading boundary makes the route
 * stream: once its shell has been sent the status is fixed at 200, so a
 * notFound() thrown later from the page can no longer produce a 404 — it
 * would render "not found" with a success status. A layout renders outside
 * its own segment's loading boundary, so a check here still controls the
 * status. The page keeps its own checks; this only has to run first.
 */
export default async function IssueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scope = await viewerBugScope();
  // #457: the segment may be a readable number (`123`, `ZE-123`) or an old id.
  const parsed = parseIssueRef(id);
  const ref = await resolveIssueRef(prisma, parsed, scope);
  const bug = ref && await prisma.bug.findUnique({
    where: { id: ref.id, ...scope },
    select: { isDeleted: true },
  });
  if (!bug) {
    // #idea-table: ideas left the issues table but kept their old id and
    // number, so a link from before still lands on the idea.
    if (typeof scope.tenantId === "string") {
      const idea = await prisma.idea.findFirst({
        where: { tenantId: scope.tenantId, ...(parsed.kind === "number" ? { legacyBugNumber: parsed.number } : { id: parsed.id }) },
        select: { number: true },
      });
      if (idea) permanentRedirect(ideaPath(idea.number));
    }
    notFound();
  }

  if (bug.isDeleted) {
    // Deleted issues are visible to those who can restore them, and a 404 to
    // everyone else — the same rule the page applies.
    const session = await auth();
    if (!session?.user) notFound();
    const user = await requireUser();
    const access = await currentTenantAccess(user.id, user.role);
    if (!canDeleteTicket(user.role, access.membershipRole)) notFound();
  }

  return children;
}
