import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAIRING_LINK_MESSAGE } from "./pairing-link";
import { claudePromptTemplate, chatGptPromptTemplate } from "./templates";
import { agentOnboardingPrompt } from "./onboarding-prompt";
import { agentAccessRequest } from "./bootstrap-message";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// #487: every place that tells an agent how to handle the pairing link gives
// the same rule, so an agent never has to choose between them.
const prompts = {
  "Claude template": claudePromptTemplate({ origin: "https://ziki.dev", projectId: "p1", projectName: "Ziki" }),
  "ChatGPT template": chatGptPromptTemplate({ origin: "https://ziki.dev", projectId: "p1", projectName: "Ziki" }),
  "onboarding prompt": agentOnboardingPrompt("https://ziki.dev"),
  "access request": agentAccessRequest({ origin: "https://ziki.dev", projectName: "Ziki" }),
};

describe("pairing link rule (#487)", () => {
  it.each(Object.entries(prompts))("%s shows the link and opens it only if the agent can", (_name, text) => {
    expect(text).toContain("If you can open a browser");
    expect(text).not.toMatch(/Do not only print/i);
    expect(text).not.toMatch(/Stop and wait/i);
  });

  it("returns the shared message from POST /api/v1/agents/pairing", () => {
    const route = read("app/api/v1/agents/pairing/route.ts");
    expect(route).toContain("message: PAIRING_LINK_MESSAGE");
    expect(route).not.toContain("Do not only print");
  });

  it("documents the same message and rule in llms.txt", () => {
    const docs = read("docs/ziki-for-agents.md");
    expect(docs).toContain(`"message": "${PAIRING_LINK_MESSAGE}"`);
    expect(docs).not.toMatch(/Do not only print/i);
    expect(docs).toContain("If you can open a browser");
  });

  it("still tells the agent to show the code and the link", () => {
    expect(PAIRING_LINK_MESSAGE).toContain("user_code");
    expect(PAIRING_LINK_MESSAGE).toContain("verification_uri_complete");
  });
});
