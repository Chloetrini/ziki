import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const requireUser = vi.hoisted(() => vi.fn());
const currentTenantIdFor = vi.hoisted(() => vi.fn());
const projectContextFor = vi.hoisted(() => vi.fn());
const isAgentPlatformEnabled = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor }));
vi.mock("@/lib/project-context", () => ({ projectContextFor }));
vi.mock("@/lib/feature-flags", () => ({ isAgentPlatformEnabled }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/(app)/settings/agents/connect/connect-agent-flow", () => ({
  ConnectAgentFlow: () => null,
}));

import ConnectAgentPage from "./page";
import { ConnectAgentFlow } from "@/app/(app)/settings/agents/connect/connect-agent-flow";

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

describe("ConnectAgentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1" });
    isAgentPlatformEnabled.mockReturnValue(true);
    currentTenantIdFor.mockResolvedValue("tenant_1");
    projectContextFor.mockResolvedValue({
      projects: [{ id: "proj_1", name: "Alpha", slug: "alpha" }],
      activeProjectId: "proj_1",
    });
  });

  it("shows only the Connect agent flow for the active project", async () => {
    const element = await ConnectAgentPage({ searchParams: Promise.resolve({}) });
    expect(findElement(element, ConnectAgentFlow)).toMatchObject({ props: { projectId: "proj_1" } });
  });

  it("has no flow without a workspace", async () => {
    currentTenantIdFor.mockResolvedValue(null);
    projectContextFor.mockResolvedValue({ projects: [], activeProjectId: null });
    const element = await ConnectAgentPage({ searchParams: Promise.resolve({}) });
    expect(findElement(element, ConnectAgentFlow)).toBeNull();
  });

  it("has no flow without a project", async () => {
    projectContextFor.mockResolvedValue({ projects: [], activeProjectId: null });
    const element = await ConnectAgentPage({ searchParams: Promise.resolve({}) });
    expect(findElement(element, ConnectAgentFlow)).toBeNull();
  });

  it("has no flow when the agent platform is off", async () => {
    isAgentPlatformEnabled.mockReturnValue(false);
    const element = await ConnectAgentPage({ searchParams: Promise.resolve({}) });
    expect(findElement(element, ConnectAgentFlow)).toBeNull();
  });

  it("sends a pairing code to the approval page", async () => {
    await expect(ConnectAgentPage({ searchParams: Promise.resolve({ code: "ABCD-2345" }) })).rejects.toThrow(
      "NEXT_REDIRECT /settings/agents/pair?code=ABCD-2345",
    );
  });
});
