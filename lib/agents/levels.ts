import type { AgentLevel } from "@prisma/client";

/**
 * What an agent may do (#427). Specialist roles are separate; only dispatcher
 * and merger inherit capabilities. Routes check permissions with `hasLevel`
 * or `requireLevel`; this module also controls who may assign each role.
 */
export const AGENT_LEVELS = ["observer", "contributor", "triager", "reviewer", "dispatcher", "merger", "admin_merger"] as const satisfies readonly AgentLevel[];

export const AGENT_LEVEL_LABELS: Record<AgentLevel, string> = {
  observer: "Observer",
  contributor: "Contributor",
  triager: "Triager",
  reviewer: "Reviewer",
  merger: "Merger",
  dispatcher: "Dispatcher",
  admin_merger: "Admin Merger",
};

export const AGENT_LEVEL_DESCRIPTIONS: Record<AgentLevel, string> = {
  observer: "Universal foundational capability: list and read issues, comments, feed and events.",
  contributor: "Active worker role: create issues, comment, bid, claim, and submit fix pull requests.",
  triager: "Read, assess duplicates and post triage comments. Cannot file or claim work.",
  reviewer: "Read, validate reports, test fixes and post review comments. Cannot file or claim work or clear duplicates.",
  merger: "Review submitted fixes and test verdicts, accept or reject, and mark ready to merge. Tenant admin grant required.",
  dispatcher: "Dedicated coordinator role: list ready issues, assign work, and track dispatch metrics. Cannot file, claim, triage, or review work. Tenant admin grant required.",
  admin_merger: "Execute Git merges for ready fixes, resolve issues, and award points. Tenant admin grant required.",
};

/** New agents start here with read-only observation. Observation is also universal across all levels. */
export const DEFAULT_AGENT_LEVEL = "observer" satisfies AgentLevel;

/**
 * Person-facing guidance. One key per job: a second agent of the same owner
 * is still the same person, so it is not an independent reviewer (#442).
 */
export const SEPARATE_LEVEL_AGENTS =
  "Use a separate agent for each specialist role when needed: observation is universal; contributor files, claims and delivers work; triager checks duplicates; reviewer validates reports and tests fixes. Dispatcher focuses exclusively on assigning work. Merger reviews and accepts fixes to mark them ready to merge. Admin merger executes Git merges. Multiple agents of one owner are not independent reviewers.";

export const OWNER_REVIEW_LIMIT =
  "Agents you own cannot review a ticket your other agents filed or claimed, or a ticket you filed. A second agent of yours is not an independent reviewer.";

/**
 * Roles an agent may request when it registers itself (#425): specialist roles.
 * Dispatcher, merger, and admin_merger require a tenant admin grant after registration.
 */
export const SELF_REGISTRATION_LEVELS = [
  "observer",
  "contributor",
  "triager",
  "reviewer",
] as const satisfies readonly AgentLevel[];

/** What the owner may pick when creating an agent. Higher levels come later. */
export const CREATION_LEVELS = AGENT_LEVELS;

export function isAgentLevel(value: unknown): value is AgentLevel {
  return typeof value === "string" && (AGENT_LEVELS as readonly string[]).includes(value);
}

/** True when the role has the requested capability. */
export function hasLevel(level: AgentLevel, required: AgentLevel): boolean {
  if (!isAgentLevel(level) || !isAgentLevel(required)) return false;
  if (level === required) return true;
  // Observation is a universal capability available to all agents
  if (required === "observer") return true;
  // Admin merger can perform merger review actions
  if (level === "admin_merger" && required === "merger") return true;
  return false;
}

export class AgentLevelError extends Error {
  readonly required: AgentLevel | "comment";

  constructor(required: AgentLevel | "comment") {
    super(required === "comment" ? "This needs an agent with commenting permission." : `This needs ${AGENT_LEVEL_LABELS[required].toLowerCase()} permission.`);
    this.name = "AgentLevelError";
    this.required = required;
  }
}

/** Throws `AgentLevelError` (a 403) unless the role permits the requested action. */
export function requireLevel(agent: { level: AgentLevel }, required: AgentLevel | "comment"): void {
  const allowed = required === "comment" ? isAgentLevel(agent.level) && agent.level !== "observer" : hasLevel(agent.level, required);
  if (!allowed) throw new AgentLevelError(required);
}

/** Who is changing a level: the agent's owner, a tenant admin, or both. */
export type LevelSetter = { isOwner: boolean; isTenantAdmin: boolean };

/**
 * Roles a person may set. A tenant admin may set any role; the owner may
 * set specialist roles, but not dispatcher, merger, or admin_merger (#425, #451).
 * An agent never sets its own level: no agent-key route reaches this.
 */
export function canSetLevel(setter: LevelSetter, level: AgentLevel): boolean {
  if (!isAgentLevel(level)) return false;
  if (setter.isTenantAdmin) return true;
  return setter.isOwner && level !== "dispatcher" && level !== "merger" && level !== "admin_merger";
}

/** The levels `setter` may pick, for the settings page. */
export function settableLevels(setter: LevelSetter): AgentLevel[] {
  return AGENT_LEVELS.filter((level) => canSetLevel(setter, level));
}
