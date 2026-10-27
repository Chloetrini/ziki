import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /settings/agents is the "My agents" page and nothing else. Creating an agent
 * and the team's agents are separate pages owned by other tickets, so they must
 * not come back into this one. Same source-level guard as the issue page test.
 */
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("My agents page", () => {
  it("does not embed the Create agent form or its section", () => {
    expect(source).not.toContain("CreateAgentForm");
    expect(source).not.toContain("register-heading");
  });

  it("does not list other people's agents", () => {
    expect(source).not.toContain("team-heading");
    expect(source).not.toContain("AgentControls");
    expect(source).not.toMatch(/membership\.findMany/);
  });

  it("only reads the signed-in person's own agents", () => {
    expect(source).toMatch(/ownerUserId: user\.id/);
  });

  it("links to Create agent through a single constant", () => {
    expect(source).toMatch(/const CREATE_AGENT_HREF = "/);
    expect(source).toMatch(/href=\{CREATE_AGENT_HREF\}/);
  });
});
