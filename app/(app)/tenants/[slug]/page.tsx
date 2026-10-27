import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import {
  StatusPage,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/status-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { MemberRoleActions } from "@/components/member-role-actions";
import { requireUser } from "@/lib/auth-helpers";
import { isSuperAdmin } from "@/lib/roles";
import { INVITE_TTL_DAYS, canInvite, pendingInvites } from "@/lib/invites";
import { prisma } from "@/lib/prisma";
import { ZEDU_SLUG } from "@/lib/tenant";
import { currentTenantIdFor } from "@/lib/tenant-context";
import {
  MEMBERSHIP_ROLE_LABELS,
  TENANT_NAME_MAX,
  memberTenantBySlug,
  tenantMembersFrom,
  type TenantChoice,
} from "@/lib/tenants";
import {
  deleteTenantAction,
  renameTenantAction,
  reviewTenantJoinRequestAction,
  revokeInviteAction,
  revokeShareLinkAction,
  selectTenantAction,
  setTenantArchivedAction,
  updateTenantDiscoveryAction,
} from "../actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { joinedSummary, listShareLinks, shareLinkStatusLabel } from "@/lib/share-invites";
import { InviteForm } from "./invite-form";
import { ShareLinkForm } from "./share-link-form";
import { pendingTenantJoinRequests, TENANT_DESCRIPTION_MAX, tenantSummary } from "@/lib/tenant-join-requests";
import { databaseErrorReason } from "@/lib/db-error";

/* Static on purpose: a title built from the slug could name someone else's tenant. */
export const metadata = { title: "Organization" };

const card = "rounded-[20px] border border-zk-border bg-zk-surface p-4 sm:p-6";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

async function loadTenant(
  userId: string,
  slug: string,
): Promise<{ tenant: TenantChoice | null; problem: string | null }> {
  try {
    return { tenant: await memberTenantBySlug(prisma, userId, slug), problem: null };
  } catch (error) {
    console.error("[tenant] lookup failed", error);
    return {
      tenant: null,
      problem: databaseErrorReason(error) ?? "The workspace record could not be read.",
    };
  }
}

async function loadQuietly<T>(label: string, task: Promise<T>, empty: T): Promise<T> {
  try {
    return await task;
  } catch (error) {
    console.error(`[tenant] ${label} failed`, error);
    return empty;
  }
}

/**
 * Memberships and users are loaded apart so a missing user does not fail the page.
 * Owners and admins are taken from this list for the same reason: joining `user`
 * in one query throws "Field user is required" and the whole page dies.
 */
async function loadTenantMembers(tenantId: string) {
  try {
    const rows = await prisma.membership.findMany({
      where: { tenantId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      take: 200,
      select: { role: true, createdAt: true, userId: true },
    });
    if (rows.length === 0) return [];
    const people = await prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) } },
      select: { id: true, name: true, email: true, image: true, role: true },
    });
    return tenantMembersFrom(rows, people);
  } catch (error) {
    console.error("[tenant] member list failed", error);
    return [];
  }
}

/**
 * One of the person's tenants (#444): who can invite, and for its owners and
 * admins, sending and withdrawing invites.
 */
export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const {
    error: errorParam,
    notice: noticeParam,
  } = await searchParams;
  const error = typeof errorParam === "string" ? errorParam : "";
  const notice = typeof noticeParam === "string" ? noticeParam : "";
  const loaded = await loadTenant(user.id, slug);
  if (loaded.problem) {
    return (
      <StatusPage
        title="This page didn't load"
        actions={
          <>
            <Link href={`/tenants/${encodeURIComponent(slug)}`} className={primaryActionClass}>
              Try again
            </Link>
            <Link href="/issues" className={secondaryActionClass}>
              Go to issues
            </Link>
          </>
        }
      >
        <p>{loaded.problem}</p>
      </StatusPage>
    );
  }
  const tenant = loaded.tenant;
  // Someone else's tenant looks exactly like no tenant: its name is never read.
  if (!tenant) notFound();

  const canManage = !tenant.archivedAt && canInvite(tenant.role);
  const canChangeRoles =
    !tenant.archivedAt && (tenant.role === "owner" || isSuperAdmin(user.role));
  const canManageSettings =
    !tenant.archivedAt && (tenant.role === "owner" || isSuperAdmin(user.role));
  const [currentTenantId, summary, invites, members, shareLinks, joinRequests] = await Promise.all([
    currentTenantIdFor(user.id),
    loadQuietly("summary", tenantSummary(prisma, tenant.id), null),
    canManage ? loadQuietly("invites", pendingInvites(prisma, tenant.id), []) : [],
    loadTenantMembers(tenant.id),
    canManage ? loadQuietly("share links", listShareLinks(prisma, tenant.id), []) : [],
    canManage ? loadQuietly("join requests", pendingTenantJoinRequests(prisma, tenant.id), []) : [],
  ]);
  const managers = members.filter((member) => member.role === "owner" || member.role === "admin").slice(0, 20);
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const current = tenant.id === currentTenantId;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Link href="/tenants" className="text-sm text-zk-accent hover:underline">
          ← All organizations
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight text-zk-text">{tenant.name}</h1>
          {tenant.archivedAt ? (
            <Badge className="rounded-full bg-zk-warn-bg text-zk-warn-fg ring-1 ring-zk-warn-bd">Archived</Badge>
          ) : current ? (
            <Badge className="rounded-full bg-zk-tint text-zk-accent ring-1 ring-zk-border">Current</Badge>
          ) : null}
        </div>
        <p className="text-sm text-zk-text2">
          You&apos;re {tenant.role === "member" ? "a" : "an"} {MEMBERSHIP_ROLE_LABELS[tenant.role].toLowerCase()}
          {summary
            ? ` · ${plural(summary.memberships, "member")} · ${plural(summary.projects, "project")}`
            : null}
        </p>
        {current || tenant.archivedAt ? null : (
          <form action={selectTenantAction}>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <Button type="submit">Open {tenant.name}</Button>
          </form>
        )}
      </div>

      {tenant.archivedAt ? (
        <section className="rounded-xl border border-zk-warn-bd bg-zk-warn-bg p-4 sm:p-6">
          <h2 className="text-base font-semibold text-zk-warn-fg">This organization is archived</h2>
          <p className="mt-1 text-sm text-zk-warn-fg">
            Archived organizations are hidden from the switcher and can&apos;t be opened. Its issues and
            members stay here, read-only, until an owner restores it.
          </p>
          {tenant.role === "owner" || isSuperAdmin(user.role) ? (
            <form action={setTenantArchivedAction} className="mt-3">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <input type="hidden" name="archived" value="false" />
              <Button type="submit" variant="secondary">
                Restore organization
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p className="rounded-[14px] border border-zk-bad-bd bg-zk-bad-bg px-3 py-2 text-sm text-zk-bad-fg">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-[14px] border border-zk-border bg-zk-ok-bg px-3 py-2 text-sm text-zk-ok-fg">
          {notice}
        </p>
      ) : null}

      {canManageSettings ? (
        <section aria-labelledby="tenant-settings" className={card}>
          <h2 id="tenant-settings" className="text-base font-semibold text-zk-text">
            Organization settings
          </h2>
          <p className="mt-1 text-sm text-zk-text2">
            Rename this organization, archive it, or delete it permanently when it has no issues,
            agents or other members.
          </p>

          <form action={renameTenantAction} className="mt-4 space-y-2">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <label htmlFor="tenant-name" className="block text-sm font-medium text-zk-text">
              Display name
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="tenant-name"
                name="name"
                defaultValue={tenant.name}
                maxLength={TENANT_NAME_MAX}
                required
                className="min-w-0 flex-1 rounded-xl border border-zk-border px-3 py-1.5 text-sm text-zk-text"
              />
              <Button type="submit" variant="secondary">
                Save name
              </Button>
            </div>
            <p className="text-xs text-zk-muted">
              The organization&apos;s URL stays the same, so existing links keep working.
            </p>
          </form>

          <div className="mt-5 space-y-4 border-t border-zk-border pt-4">
            {tenant.slug === ZEDU_SLUG ? (
              <p className="text-xs text-zk-muted">
                Zedu is the default workspace and can&apos;t be archived or deleted.
              </p>
            ) : (
              <>
                <form action={setTenantArchivedAction}>
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <input type="hidden" name="archived" value="true" />
                  <Button type="submit" variant="secondary">
                    Archive organization
                  </Button>
                  <p className="mt-1 text-xs text-zk-muted">
                    Archiving hides it from the switcher. You can restore it later.
                  </p>
                </form>

                <form action={deleteTenantAction} className="space-y-2">
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <p className="text-sm font-medium text-zk-text">Delete organization</p>
                  <p className="text-xs text-zk-muted">
                    Deleting is permanent and only works when the organization has no issues, agents or
                    other members. Otherwise archive it instead.
                  </p>
                  <label htmlFor="confirm-tenant-name" className="block text-xs text-zk-text2">
                    Type <span className="font-semibold text-zk-text">{tenant.name}</span> to
                    confirm
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="confirm-tenant-name"
                      name="confirmName"
                      placeholder={tenant.name}
                      autoComplete="off"
                      required
                      className="min-w-0 flex-1 rounded-xl border border-zk-border px-3 py-1.5 text-sm text-zk-text"
                    />
                    <Button type="submit" variant="danger-secondary">
                      Delete organization
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="tenant-managers" className={card}>
        <h2 id="tenant-managers" className="text-base font-semibold text-zk-text">
          Owners and admins
        </h2>
        {managers.length === 0 ? (
          <p className="mt-1 text-sm text-zk-text2">
            {tenant.slug === ZEDU_SLUG
              ? "Ziki has no owner yet, so nobody can invite people. The site's super admin can choose one from its members."
              : "Nobody here can invite people yet."}
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {managers.map((manager) => (
              <li key={manager.user.id} className="flex items-center gap-2 text-sm text-zk-text">
                <span className="truncate">{manager.user.name}</span>
                <Badge className="rounded-full bg-zk-chip text-zk-text2">{MEMBERSHIP_ROLE_LABELS[manager.role]}</Badge>
              </li>
            ))}
          </ul>
        )}
        {canManage ? null : (
          <p className="mt-3 text-xs text-zk-muted">
            Only owners and admins can invite people. Ask one of them to invite your teammate.
          </p>
        )}
      </section>

      <section aria-labelledby="tenant-members" className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface">
        <h2
          id="tenant-members"
          className="border-b border-zk-border bg-zk-tint px-4 py-3 text-base font-semibold text-zk-text sm:px-6"
        >
          Members
        </h2>
        <p className="border-b border-zk-border px-4 py-3 text-sm text-zk-text2 sm:px-6">
          Roles here apply only in {tenant.name}. Someone who is an admin somewhere else is a member here until an owner promotes them.
        </p>
        <ul className="divide-y divide-zk-border">
          {members.map((member) => (
            <li key={member.user.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <Avatar name={member.user.name} image={member.user.image} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zk-text">{member.user.name}</p>
                <p className="truncate text-xs text-zk-muted">{member.user.email}</p>
                <p className="mt-0.5 text-xs text-zk-muted">
                  Joined <LocalTime date={member.createdAt} />
                </p>
              </div>
              <Badge className="rounded-full bg-zk-chip text-zk-text2">{MEMBERSHIP_ROLE_LABELS[member.role]}</Badge>
              <MemberRoleActions
                tenantId={tenant.id}
                tenantName={tenant.name}
                userId={member.user.id}
                userName={member.user.name ?? member.user.email ?? "Member"}
                membershipRole={member.role}
                siteSuperAdmin={member.user.role === "super_admin"}
                canChangeRoles={canChangeRoles}
                canRemove={canManage || isSuperAdmin(user.role)}
                isSelf={member.user.id === user.id}
                ownerCount={ownerCount}
              />
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <>
          <section aria-labelledby="workspace-discovery" className={card}>
            <h2 id="workspace-discovery" className="text-base font-semibold text-zk-text">Workspace discovery</h2>
            <p className="mt-1 text-sm text-zk-text2">When enabled, people without a workspace can find this one and request access. They become members only after an owner or admin approves.</p>
            <form action={updateTenantDiscoveryAction} className="mt-4 space-y-4">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <label className="flex items-start gap-3 text-sm text-zk-text">
                <input type="checkbox" name="discoverable" defaultChecked={summary?.discoverable ?? false} className="mt-0.5 rounded border-zk-border text-zk-accent focus:ring-electric-blue" />
                <span><span className="font-medium">Accept join requests</span><span className="mt-0.5 block text-xs text-zk-muted">Show this workspace in discovery to users who do not belong to a workspace.</span></span>
              </label>
              <label className="block text-sm font-medium text-zk-text" htmlFor="workspace-description">Description <span className="font-normal text-zk-muted">(optional, up to {TENANT_DESCRIPTION_MAX} characters)</span></label>
              <textarea id="workspace-description" name="description" maxLength={TENANT_DESCRIPTION_MAX} rows={3} defaultValue={summary?.description ?? ""} className="w-full rounded-xl border border-zk-border px-3 py-2 text-sm text-zk-text shadow-sm focus:border-electric-blue focus:outline-none focus:ring-1 focus:ring-electric-blue" />
              <Button type="submit">Save discovery settings</Button>
            </form>
          </section>

          <section aria-labelledby="join-requests" className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface">
            <h2 id="join-requests" className="border-b border-zk-border bg-zk-tint px-4 py-3 text-base font-semibold text-zk-text sm:px-6">Workspace join requests</h2>
            {joinRequests.length === 0 ? (
              <p className="px-4 py-4 text-sm text-zk-text2 sm:px-6">No pending requests.</p>
            ) : (
              <ul className="divide-y divide-zk-border">
                {joinRequests.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zk-text">{request.user.name ?? request.user.email}</p>
                      <p className="truncate text-xs text-zk-muted">{request.user.email} · requested <LocalTime date={request.requestedAt} /></p>
                    </div>
                    <form action={reviewTenantJoinRequestAction} className="flex gap-2">
                      <input type="hidden" name="requestId" value={request.id} />
                      <Button name="status" value="approved" type="submit">Approve</Button>
                      <Button name="status" value="rejected" type="submit" variant="danger-secondary">Reject</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="share-link" className={card}>
            <h2 id="share-link" className="text-base font-semibold text-zk-text">
              Invite link
            </h2>
            <p className="mt-1 text-sm text-zk-text2">
              Share one link instead of typing each email. Anyone who opens it and signs in with Google
              joins as a member — a new Google account is created if they don&apos;t have one, and this
              organization is added to it. Pick how long the link lasts and how many people can use it.
              Once that limit is reached, or you revoke the link, it stops working.
            </p>
            <ShareLinkForm tenantId={tenant.id} />
            <ul className="mt-4 divide-y divide-zk-border border-t border-zk-border">
              {shareLinks.length === 0 ? (
                <li className="pt-4 text-sm text-zk-text2">No invite links yet.</li>
              ) : (
                shareLinks.map((link) => {
                  const who = joinedSummary(link.joinedNames, link.useCount);
                  const statusClass =
                    link.state === "open"
                      ? "bg-zk-tint text-zk-accent ring-1 ring-zk-border"
                      : link.state === "revoked"
                        ? "bg-zk-bad-bg text-zk-bad-fg"
                        : "bg-zk-chip text-zk-text2";
                  return (
                    <li key={link.id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zk-text">
                          <span className="truncate">{link.label || "Invite link"}</span>
                          <Badge className={statusClass}>{shareLinkStatusLabel(link.state)}</Badge>
                        </p>
                        <p className="text-xs text-zk-muted">
                          {link.useCount} joined{link.maxUses != null ? ` of ${link.maxUses}` : ""}
                          {who ? ` · ${who}` : ""}
                          {" · "}
                          {link.state === "expired" ? "expired" : "expires"} <LocalTime date={link.expiresAt} />
                          {" · "}
                          {link.invitedByName}
                        </p>
                        {link.url ? (
                          <p className="truncate font-mono text-xs text-zk-text2">{link.url}</p>
                        ) : (
                          <p className="text-xs text-zk-muted">
                            This link can&apos;t be shown. Revoke it and create another.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {link.url ? <CopyLinkButton url={link.url} label="invite" /> : null}
                        {link.state === "open" ? (
                          <form action={revokeShareLinkAction}>
                            <input type="hidden" name="linkId" value={link.id} />
                            <Button type="submit" variant="danger-secondary" aria-label={`Revoke invite link${link.label ? ` ${link.label}` : ""}`}>
                              Revoke
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section aria-labelledby="invite-someone" className={card}>
            <h2 id="invite-someone" className="text-base font-semibold text-zk-text">
              Invite by email
            </h2>
            <p className="mt-1 text-sm text-zk-text2">
              For one person. The link works once, only for the address you enter, and expires after{" "}
              {INVITE_TTL_DAYS} days. To invite several people at once, create an invite link above.
            </p>
            <InviteForm tenantId={tenant.id} />
          </section>

          <section aria-labelledby="pending-invites" className="overflow-hidden rounded-[20px] border border-zk-border bg-zk-surface">
            <h2
              id="pending-invites"
              className="border-b border-zk-border bg-zk-tint px-4 py-3 text-base font-semibold text-zk-text sm:px-6"
            >
              Pending email invites
            </h2>
            {invites.length === 0 ? (
              <p className="px-4 py-4 text-sm text-zk-text2 sm:px-6">No invites waiting to be accepted.</p>
            ) : (
              <ul className="divide-y divide-zk-border">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zk-text">{invite.email}</p>
                      <p className="mt-0.5 text-xs text-zk-muted">
                        Invited by {invite.invitedByName} · expires <LocalTime date={invite.expiresAt} />
                      </p>
                    </div>
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <Button type="submit" variant="danger-secondary" aria-label={`Revoke the invite for ${invite.email}`}>
                        Revoke
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
