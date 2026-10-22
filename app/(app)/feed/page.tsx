import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { feedProject, feedWhere, FEED_PAGE_SIZE } from "@/lib/feed";
import { prisma } from "@/lib/prisma";
import { LocalTime } from "@/components/local-time";
import { issuePath } from "@/lib/issue-ref";

export const metadata = { title: "New-ticket feed" };

export default async function FeedPage({ searchParams }: {
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  const { projectId } = await searchParams;
  if (Array.isArray(projectId)) notFound();
  const project = tenantId ? await feedProject(tenantId, projectId) : null;
  if (tenantId && !project) notFound();
  const issues = tenantId && project ? await prisma.bug.findMany({
    where: feedWhere(tenantId, project.id, null),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FEED_PAGE_SIZE,
    select: { id: true, number: true, title: true, status: true, createdAt: true },
  }) : [];
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">New-ticket feed</h1>
        <p className="mt-2 text-sm text-slate-600">The newest {FEED_PAGE_SIZE} issues{project ? ` in ${project.name}` : " in your workspace"}, newest first.</p>
      </div>
      {issues.length ? (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {issues.map((issue) => (
            <li key={issue.id} className="p-4">
              <Link href={issuePath(issue.number)} className="font-medium text-teal-700 hover:underline">#{issue.number} {issue.title}</Link>
              <p className="mt-1 text-sm text-slate-500">
                {issue.status.replaceAll("_", " ")} · <LocalTime date={issue.createdAt} />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
          {tenantId ? "No new tickets in this project yet." : "Join a workspace to see its new tickets."} <Link href="/feed" className="text-teal-700 hover:underline">Refresh the feed</Link> or <Link href="/issues" className="text-teal-700 hover:underline">browse issues</Link>.
        </p>
      )}
      <Link href={project ? `/feed?projectId=${encodeURIComponent(project.id)}` : "/feed"} className="text-sm font-medium text-teal-700 hover:underline">Refresh newest tickets</Link>
    </section>
  );
}
