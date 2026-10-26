import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AgentLevelError,
  AGENT_LEVELS,
  OWNER_REVIEW_LIMIT,
  SEPARATE_LEVEL_AGENTS,
  canSetLevel,
  hasLevel,
  isAgentLevel,
  requireLevel,
  settableLevels,
} from "./levels";

describe("agent levels (#427)", () => {
  it("keeps specialist roles separate, isolates dispatcher, and provides universal observation", () => {
    expect(hasLevel("merger", "observer")).toBe(true);
    expect(hasLevel("reviewer", "contributor")).toBe(false);
    expect(hasLevel("reviewer", "triager")).toBe(false);
    expect(hasLevel("triager", "contributor")).toBe(false);
    expect(hasLevel("contributor", "contributor")).toBe(true);
    expect(hasLevel("contributor", "observer")).toBe(true);
    expect(hasLevel("observer", "contributor")).toBe(false);
    expect(hasLevel("reviewer", "merger")).toBe(false);
    expect(hasLevel("merger", "dispatcher")).toBe(false);
    expect(hasLevel("dispatcher", "merger")).toBe(false);
    expect(hasLevel("dispatcher", "reviewer")).toBe(false);
    expect(hasLevel("dispatcher", "contributor")).toBe(false);
    expect(hasLevel("dispatcher", "dispatcher")).toBe(true);
    expect(hasLevel("dispatcher", "observer")).toBe(true);
    expect(hasLevel("admin_merger", "merger")).toBe(true);
    expect(hasLevel("admin_merger", "observer")).toBe(true);
  });

  it("enforces the complete capability matrix", () => {
    const ladder = ["observer", "contributor", "triager", "reviewer", "dispatcher", "merger", "admin_merger"] as const;
    expect(AGENT_LEVELS).toEqual(ladder);
    const allowed = {
      observer: ["observer"],
      contributor: ["observer", "contributor"],
      triager: ["observer", "triager"],
      reviewer: ["observer", "reviewer"],
      dispatcher: ["observer", "dispatcher"],
      merger: ["observer", "merger"],
      admin_merger: ["observer", "merger", "admin_merger"],
    };
    for (const level of ladder) {
      for (const required of ladder) {
        expect(hasLevel(level, required)).toBe(allowed[level].includes(required));
      }
    }
  });

  it("requireLevel throws a 403-shaped error below the level", () => {
    expect(() => requireLevel({ level: "contributor" }, "contributor")).not.toThrow();
    expect(() => requireLevel({ level: "observer" }, "contributor")).toThrow(AgentLevelError);
    try {
      requireLevel({ level: "observer" }, "reviewer");
    } catch (error) {
      expect((error as AgentLevelError).required).toBe("reviewer");
    }
  });

  it("reserves dispatcher, merger, and admin_merger grants for tenant admins", () => {
    const owner = { isOwner: true, isTenantAdmin: false };
    expect(canSetLevel(owner, "reviewer")).toBe(true);
    expect(canSetLevel(owner, "triager")).toBe(true);
    expect(canSetLevel(owner, "merger")).toBe(false);
    expect(canSetLevel(owner, "dispatcher")).toBe(false);
    expect(canSetLevel(owner, "admin_merger")).toBe(false);
    expect(canSetLevel({ isOwner: false, isTenantAdmin: true }, "merger")).toBe(true);
    expect(canSetLevel({ isOwner: false, isTenantAdmin: true }, "dispatcher")).toBe(true);
    expect(canSetLevel({ isOwner: false, isTenantAdmin: true }, "admin_merger")).toBe(true);
    expect(canSetLevel({ isOwner: false, isTenantAdmin: false }, "observer")).toBe(false);
    expect(settableLevels(owner)).toEqual(["observer", "contributor", "triager", "reviewer"]);
  });

  it("explains specialist roles without weakening review independence", () => {
    expect(SEPARATE_LEVEL_AGENTS).toContain("observation is universal");
    expect(SEPARATE_LEVEL_AGENTS).toMatch(/contributor/);
    expect(SEPARATE_LEVEL_AGENTS).toMatch(/reviewer/);
    expect(SEPARATE_LEVEL_AGENTS).toMatch(/merger/);
    expect(OWNER_REVIEW_LIMIT).toMatch(/not an independent reviewer/);
    expect(OWNER_REVIEW_LIMIT).toMatch(/ticket you filed/);
    const doc = readFileSync(path.resolve(__dirname, "../../docs/ziki-for-agents.md"), "utf8");
    expect(doc).toContain("separate agent for each level");
    expect(doc).toContain("Independence is by **owner**, not by agent");
  });

  it("recognises only real levels, so a forged body can't set one", () => {
    expect(isAgentLevel("merger")).toBe(true);
    expect(isAgentLevel("admin_merger")).toBe(true);
    expect(isAgentLevel("admin")).toBe(false);
    expect(isAgentLevel(undefined)).toBe(false);
  });
});
