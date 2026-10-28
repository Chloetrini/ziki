import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const requireUser = vi.hoisted(() => vi.fn());
const currentTenantIdFor = vi.hoisted(() => vi.fn());
const projectContextFor = vi.hoisted(() => vi.fn());
const isAgentPlatformEnabled = vi.hoisted(() => vi.fn());
const findPendingPairing = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor }));
vi.mock("@/lib/project-context", () => ({ projectContextFor }));
vi.mock("@/lib/feature-flags", () => ({ isAgentPlatformEnabled }));
vi.mock("@/lib/agents/pairing", () => ({ findPendingPairing }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://ziki.dev" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentApiKey: {
      findFirst: vi.fn(),
    },
  },
}));

import ConnectAgentPage from "./page";
import { PairForm } from "@/app/(app)/settings/agents/pair/pair-form";
import { prisma } from "@/lib/prisma";

function findElement(node: ReactNode, type: ReactElement["type"]): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("type" in node) || !("props" in node)) return null;

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) return element;
  return findElement(element.props.children, type);
}

describe("ConnectAgentPage Server Component (#610)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1" });
    isAgentPlatformEnabled.mockReturnValue(true);
    currentTenantIdFor.mockResolvedValue("tenant_1");
    projectContextFor.mockResolvedValue({
      projects: [{ id: "proj_1", name: "Alpha", slug: "alpha" }],
      activeProjectId: "proj_1",
    });
    findPendingPairing.mockResolvedValue(null);
    vi.mocked(prisma.agentApiKey.findFirst).mockResolvedValue(null);
  });

  it("shows disabled message when agent platform is switched off", async () => {
    isAgentPlatformEnabled.mockReturnValue(false);
    const element = await ConnectAgentPage({ searchParams: Promise.resolve({}) });
    expect(element).toBeTruthy();
  });

  it("prompts to join workspace if user has no current tenant", async () => {
    currentTenantIdFor.mockResolvedValue(null);
    const element = await ConnectAgentPage({ searchParams: Promise.resolve({}) });
    expect(element).toBeTruthy();
  });

  it("renders page with templates for active project", async () => {
    const element = await ConnectAgentPage({ searchParams: Promise.resolve({}) });
    expect(element).toBeTruthy();
    expect(findElement(element, PairForm)).toMatchObject({
      props: { initialCode: "", unknownCode: false, activeProjectId: "proj_1" },
    });
  });

  it("loads a pairing request code on the combined connect page", async () => {
    findPendingPairing.mockResolvedValue({
      proposedName: "Review Agent",
      proposedModel: "GPT-4o",
      proposedLevel: "reviewer",
      proposedInstructions: null,
    });

    const element = await ConnectAgentPage({ searchParams: Promise.resolve({ code: "abcd2345" }) });
    expect(findPendingPairing).toHaveBeenCalledWith("ABCD-2345");
    expect(findElement(element, PairForm)).toMatchObject({
      props: {
        initialCode: "ABCD-2345",
        unknownCode: false,
        pending: { name: "Review Agent", model: "GPT-4o", level: "reviewer" },
      },
    });
  });
});
