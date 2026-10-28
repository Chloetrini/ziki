import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn());
const currentTenantIdFor = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor }));
vi.mock("@/lib/prisma", () => ({ prisma: { agent: { findFirst } } }));

import LegacyAgentMessagesPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "user_1" });
  currentTenantIdFor.mockResolvedValue("tenant_1");
});

describe("old agent messages address", () => {
  it("sends an agent in this workspace to its name-based page", async () => {
    findFirst.mockResolvedValue({ name: "Scout Two" });
    await expect(LegacyAgentMessagesPage({ params: Promise.resolve({ agentId: "agent_1" }) })).rejects.toThrow(
      "NEXT_REDIRECT /settings/agent/Scout%20Two",
    );
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "agent_1", tenantId: "tenant_1" }, select: { name: true } });
  });

  it("is not found for an agent outside the workspace", async () => {
    findFirst.mockResolvedValue(null);
    await expect(LegacyAgentMessagesPage({ params: Promise.resolve({ agentId: "agent_x" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
