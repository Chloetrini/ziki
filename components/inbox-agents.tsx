"use client";

import { useState } from "react";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import type { AgentStatus } from "@/lib/dashboard-overview";

export type InboxAgent = {
  id: string;
  name: string;
  status: AgentStatus;
  activity: string;
  /** "Last 30 days: …", already worded. */
  done: string;
};

/** The status light on the avatar: green working, amber waiting on you, blue standing by, grey offline. */
const STATUS_LIGHT: Record<AgentStatus, string> = {
  working: "bg-[#22C55E]",
  waiting: "bg-[#F59E0B]",
  idle: "bg-[#60A5FA]",
  offline: "bg-[#94A3B8]",
};

const STATUS_LABEL: Record<AgentStatus, { label: string; tone: string }> = {
  working: { label: "Working", tone: "bg-zk-ok-bg text-zk-ok-fg" },
  waiting: { label: "Waiting on you", tone: "bg-zk-warn-bg text-zk-warn-fg" },
  idle: { label: "Standing by", tone: "bg-zk-info-bg text-zk-info-fg" },
  offline: { label: "Offline", tone: "bg-zk-chip text-zk-muted" },
};

/**
 * Your agents in the Inbox's top box, one at a time; the dots switch between
 * them. Work / Stop work is shown but not wired up yet.
 */
export function InboxAgents({ agents }: { agents: InboxAgent[] }) {
  const [index, setIndex] = useState(0);

  if (agents.length === 0) {
    return (
      <p className="text-[13px] text-zk-muted">
        No agents yet. <Link href="/settings/agents" className="font-semibold text-zk-accent hover:underline">Add one</Link> to work on issues for you.
      </p>
    );
  }

  const agent = agents[Math.min(index, agents.length - 1)];
  const status = STATUS_LABEL[agent.status];
  const working = agent.status === "working";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5" aria-live="polite">
        <span className="relative shrink-0">
          <AgentAvatar agentId={agent.id} size={36} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zk-surface ${STATUS_LIGHT[agent.status]} ${
              agent.status === "working" ? "motion-safe:animate-pulse" : ""
            }`}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-zk-text">{agent.name}</span>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="ml-auto inline-flex h-6 shrink-0 cursor-not-allowed items-center rounded-full border border-zk-border px-2.5 text-[11px] font-semibold text-zk-text2 opacity-70"
            >
              {working ? "Stop work" : "Work"}
            </button>
            <Link
              href="/settings/agents"
              aria-label={`Manage ${agent.name}`}
              title={`Manage ${agent.name}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zk-muted hover:bg-zk-chip hover:text-zk-text focus-visible:outline-2 focus-visible:outline-zk-accent"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
          </div>
          <span className={`mt-0.5 inline-flex rounded-full px-2 py-px text-[10.5px] font-semibold ${status.tone}`}>{status.label}</span>
          <p className="mt-1 truncate text-xs text-zk-text2">{agent.activity}</p>
          <p className="truncate text-[11px] text-zk-muted">{agent.done}</p>
        </div>
      </div>
      {agents.length > 1 ? (
        <div className="flex justify-center gap-1.5" role="group" aria-label="Choose an agent">
          {agents.map((each, i) => (
            <button
              key={each.id}
              type="button"
              aria-label={`Show ${each.name}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => setIndex(i)}
              // A taller hit area than the dot it draws.
              className="group flex h-5 items-center px-0.5 focus-visible:outline-2 focus-visible:outline-zk-accent"
            >
              <span
                className={`block h-1.5 rounded-full motion-safe:transition-all ${
                  i === index ? "w-4 bg-electric-blue-strong" : "w-1.5 bg-zk-border group-hover:bg-zk-muted"
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
