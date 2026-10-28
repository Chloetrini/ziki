import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { projectContextFor } from "@/lib/project-context";
import { getSiteUrl } from "@/lib/site-url";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";
import { getAgentTemplates } from "@/lib/agents/templates";
import { findPendingPairing } from "@/lib/agents/pairing";
import { AGENT_INSTRUCTIONS_MAX } from "@/lib/agent-messages";
import { ConnectAgentView } from "@/app/(app)/settings/agents/connect/connect-agent-view";
import { PairForm } from "@/app/(app)/settings/agents/pair/pair-form";
import {
  agentsLink,
  agentsMutedClass,
  agentsPrimaryBtn,
  agentsSurface,
  formatPairingCode,
} from "@/app/(app)/settings/agents/agents-ui";

export const metadata = { title: "Connect your agent" };

/**
 * Connect your agent onboarding page and approve pairings in one place (#628).
 * Ready-to-paste setups for Claude, ChatGPT, and Node/Python pollers.
 */
export default async function ConnectAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const user = await requireUser();

  if (!isAgentPlatformEnabled()) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-zk-text">Connect your agent</h1>
          <p className={agentsMutedClass}>The agent platform feature is not enabled in this environment.</p>
        </div>
      </div>
    );
  }

  const tenantId = await currentTenantIdFor(user.id);
  const context = await projectContextFor(prisma, tenantId);
  const { code } = await searchParams;
  const rawCode = typeof code === "string" ? code.slice(0, 20) : "";
  const initialCode = formatPairingCode(rawCode);
  const pendingPairing = initialCode ? await findPendingPairing(initialCode) : null;

  const activeProject =
    context.projects.find((p) => p.id === context.activeProjectId) ?? context.projects[0] ?? null;

  const projectId = activeProject?.id ?? null;
  const projectName = activeProject?.name ?? null;
  const siteUrl = getSiteUrl();

  const templates = getAgentTemplates({
    origin: siteUrl,
    projectId,
    projectName,
  });

  const initialKey = tenantId
    ? await prisma.agentApiKey.findFirst({
        where: {
          agent: { ownerUserId: user.id, tenantId, revokedAt: null },
          ...(projectId ? { projectId } : {}),
          lastUsedAt: { not: null },
        },
        include: { agent: { select: { name: true } } },
        orderBy: { lastUsedAt: "desc" },
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Link href="/agents" className={`text-sm ${agentsLink}`}>
          ← Back to agents
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-zk-text">Connect your agent</h1>
            <p className="text-sm text-zk-text2">
              Connect a separate agent for each level you use. Pick your assistant, copy the setup block, approve the
              pairing request and test your connection.
            </p>
          </div>
        </div>
      </div>

      {!tenantId ? (
        <div className={`${agentsSurface} border-dashed p-6 text-sm text-zk-text2`}>
          <p>You are not currently in a workspace. Join or create a workspace before you can connect an agent.</p>
          <div className="mt-3">
            <Link href="/tenants" className={agentsPrimaryBtn}>
              Workspaces →
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ConnectAgentView
            templates={templates}
            siteUrl={siteUrl}
            projectId={projectId}
            projectName={projectName}
            initialConnected={Boolean(initialKey?.lastUsedAt)}
            initialAgentName={initialKey?.agent?.name ?? null}
          />
          <section className="space-y-2 border-t border-zk-border pt-6" aria-labelledby="approve-agent-heading">
            <div className="space-y-1">
              <h2 id="approve-agent-heading" className="text-xl font-extrabold text-zk-text">
                Approve a pairing request
              </h2>
              <p className="text-sm text-zk-text2">
                Enter the code from an agent, then check its name and requested access before approving it.
              </p>
            </div>
            <PairForm
              initialCode={initialCode}
              pending={
                pendingPairing
                  ? {
                      name: pendingPairing.proposedName,
                      model: pendingPairing.proposedModel,
                      level: pendingPairing.proposedLevel,
                      instructions: pendingPairing.proposedInstructions,
                    }
                  : null
              }
              unknownCode={Boolean(initialCode) && !pendingPairing}
              projects={context.projects}
              activeProjectId={context.activeProjectId}
              instructionsMaxLength={AGENT_INSTRUCTIONS_MAX}
            />
          </section>
        </>
      )}
    </div>
  );
}
