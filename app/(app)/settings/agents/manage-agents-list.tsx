"use client";

import { useState } from "react";
import Link from "next/link";
import type { AgentLevel } from "@prisma/client";
import { AGENT_LEVEL_LABELS } from "@/lib/agents/levels";
import { LocalTime } from "@/components/local-time";
import { RelativeTime } from "@/components/relative-time";
import { AgentControls } from "./agent-controls";
import { AgentRowKey } from "./agent-row-key";
import type { AgentProjectChoice } from "./create-agent-form";
import {
  agentAvatarColor,
  agentInitials,
  agentsLink,
  agentsMutedClass,
  agentsSurface,
  levelBadgeClass,
} from "./agents-ui";

export type ManageAgentItem = {
  id: string;
  name: string;
  model: string | null;
  level: AgentLevel;
  burst: boolean;
  burstUntil: string | null;
  createdAt: string;
  revokedAt: string | null;
  personal: boolean;
  currentProjectId: string | null;
  recent: boolean;
  apiKeys: {
    id: string;
    prefix: string;
    apiKey: string | null;
    projectId: string | null;
    projectName: string | null;
    lastUsedAt: string | null;
  }[];
};

export function ManageAgentsList({
  agents,
  activeCount,
  maxActive,
  levels,
  projects,
  now,
  canSetBurst,
}: {
  agents: ManageAgentItem[];
  activeCount: number;
  maxActive: number;
  levels: AgentLevel[];
  projects: AgentProjectChoice[];
  now: string;
  canSetBurst: boolean;
}) {
  const [query, setQuery] = useState("");

  const visible = agents.filter((agent) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      agent.name.toLowerCase().includes(q) ||
      (agent.model?.toLowerCase().includes(q) ?? false) ||
      AGENT_LEVEL_LABELS[agent.level].toLowerCase().includes(q)
    );
  });

  const meterPct = Math.min(100, Math.round((activeCount / Math.max(maxActive, 1)) * 100));
  const legacyCount = agents.reduce(
    (count, agent) => count + agent.apiKeys.filter((key) => !key.apiKey).length,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`${agentsSurface} p-4`}>
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-zk-muted">Active agents</p>
          <p className="mt-1 text-2xl font-extrabold text-zk-text">
            {activeCount} <span className="text-base font-semibold text-zk-muted">/ {maxActive}</span>
          </p>
          <p className="mt-0.5 text-xs text-zk-muted">limit {maxActive}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zk-seg">
            <div
              className="h-full rounded-full bg-electric-blue-strong transition-[width] duration-300"
              style={{ width: `${meterPct}%` }}
            />
          </div>
        </div>
      </div>

      {legacyCount > 0 ? (
        <div className="rounded-[20px] border border-zk-warn-bd bg-zk-warn-bg/50 px-4 py-3 text-sm text-zk-warn-fg">
          <p className="font-bold">
            {legacyCount} {legacyCount === 1 ? "key" : "keys"} can&apos;t be copied
          </p>
          <p className="mt-0.5 text-xs">
            They were issued before keys could be copied again. Regenerate a key to get a copyable one — the new key
            stays on the same row.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search agents</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agents"
            className="h-11 w-full rounded-full border border-zk-border bg-zk-surface px-4 text-sm text-zk-text placeholder:text-zk-muted focus:border-electric-blue focus:outline-none focus:ring-2 focus:ring-electric-blue/20"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className={`${agentsMutedClass} ${agentsSurface} p-6`}>
          {agents.length === 0 ? "No agents yet." : "No agents match your search."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((agent) => {
            const lastUsed = agent.apiKeys.find((key) => key.lastUsedAt)?.lastUsedAt ?? null;
            return (
              <li key={agent.id} className={`${agentsSurface} p-4 sm:p-5`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="relative shrink-0">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold text-white ${agentAvatarColor(agent.id)}`}
                      >
                        {agentInitials(agent.name)}
                      </span>
                      {!agent.revokedAt ? (
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zk-surface ${
                            agent.recent ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-base font-extrabold text-zk-text">
                          {agent.name}
                          {agent.personal ? <span className="font-normal text-zk-muted"> · personal</span> : null}
                        </p>
                        <span className={levelBadgeClass(agent.level)}>{AGENT_LEVEL_LABELS[agent.level]}</span>
                        {agent.revokedAt ? (
                          <span className="inline-flex items-center rounded-full bg-zk-bad-bg px-2.5 py-0.5 text-xs font-bold text-zk-bad-fg">
                            Revoked
                          </span>
                        ) : null}
                      </div>
                      {agent.model ? <p className="text-sm text-zk-muted">{agent.model}</p> : null}
                      <p className="text-xs text-zk-muted">
                        {agent.revokedAt ? (
                          <>
                            Revoked <LocalTime date={agent.revokedAt} />
                          </>
                        ) : agent.apiKeys.length === 0 ? (
                          <>
                            No key · Added <LocalTime date={agent.createdAt} />
                          </>
                        ) : (
                          <>
                            {lastUsed ? (
                              <>
                                Last used <RelativeTime date={lastUsed} />
                              </>
                            ) : (
                              <>Never used</>
                            )}
                            {" · "}
                            Added <LocalTime date={agent.createdAt} />
                          </>
                        )}
                      </p>
                      <Link href={`/settings/agents/${agent.id}/messages`} className={`text-xs ${agentsLink}`}>
                        Messages and instructions
                      </Link>
                      {!agent.revokedAt ? (
                        <div className="space-y-1.5 pt-1">
                          {agent.apiKeys.map((key) => (
                            <AgentRowKey
                              key={key.id}
                              apiKey={key.apiKey}
                              prefix={key.prefix}
                              projectId={key.projectId}
                              projectName={key.projectName}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="w-full shrink-0 lg:max-w-md">
                    {agent.revokedAt ? (
                      <AgentControls
                        revoked
                        personal={agent.personal}
                        agentId={agent.id}
                        agentName={agent.name}
                        level={agent.level}
                        levels={levels}
                        projects={projects}
                        now={now}
                      />
                    ) : (
                      <AgentControls
                        personal={agent.personal}
                        agentId={agent.id}
                        agentName={agent.name}
                        level={agent.level}
                        levels={levels}
                        projects={projects}
                        currentProjectId={agent.currentProjectId}
                        burst={agent.burst}
                        burstUntil={agent.burstUntil}
                        now={now}
                        canSetBurst={canSetBurst}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
