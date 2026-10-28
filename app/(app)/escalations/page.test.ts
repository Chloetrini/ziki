import { describe, expect, it, vi } from "vitest";

const redirects = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirects.redirect }));

import EscalationsPage from "./page";

describe("EscalationsPage unification redirect", () => {
  it("redirects default /escalations to /issues?inbox=input", async () => {
    redirects.redirect.mockClear();
    await EscalationsPage({});
    expect(redirects.redirect).toHaveBeenCalledWith("/issues?inbox=input");
  });

  it("redirects Redesign type to /issues?inbox=design", async () => {
    redirects.redirect.mockClear();
    await EscalationsPage({ searchParams: Promise.resolve({ type: "Redesign" }) });
    expect(redirects.redirect).toHaveBeenCalledWith("/issues?inbox=design");
  });

  it("preserves escalation id parameter on redirect", async () => {
    redirects.redirect.mockClear();
    await EscalationsPage({ searchParams: Promise.resolve({ id: "esc-42" }) });
    expect(redirects.redirect).toHaveBeenCalledWith("/issues?inbox=input&escalation=esc-42");
  });
});
