// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
const pathnameMock = vi.hoisted(() => vi.fn(() => "/issues/ZE-12"));
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: pathnameMock,
  useSearchParams: searchParamsMock,
}));

import AppNotFound from "./not-found";
import IssueNotFound from "./issues/not-found";
import PersonNotFound from "./users/[id]/not-found";
import ProjectNotFound from "./projects/[slug]/not-found";
import AgentNotFound from "./settings/agent/[name]/not-found";
import RedesignNotFound from "./redesigns/[id]/not-found";
import EscalationNotFound from "./escalations/[id]/not-found";

describe("in-app 404 pages", () => {
  beforeEach(() => {
    cleanup();
    authMock.mockReset();
  });

  it("stays general when no page names what is missing", () => {
    render(<AppNotFound />);
    expect(screen.getByRole("heading", { name: "We couldn't find that page" })).toBeInTheDocument();
    expect(screen.queryByText(/issue/i, { selector: "h1" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to issues" })).toHaveAttribute("href", "/issues");
  });

  it.each([
    ["a person", PersonNotFound, "We couldn't find that person", "Go to ranking", "/workers"],
    ["a project", ProjectNotFound, "We couldn't find that project", "Your projects", "/projects"],
    ["an agent", AgentNotFound, "We couldn't find that agent", "Your agents", "/agents"],
    ["a redesign", RedesignNotFound, "We couldn't find that redesign proposal", "Escalations", "/escalations?type=Redesign"],
    ["an escalation", EscalationNotFound, "We couldn't find that escalation", "All escalations", "/escalations"],
  ])("names %s and links back to its list", (_kind, Page, heading, link, href) => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: link })).toHaveAttribute("href", href);
  });

  it("names an issue, without a sign-in link for someone signed in", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    render(await IssueNotFound());
    expect(screen.getByRole("heading", { name: "We couldn't find that issue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to issues" })).toHaveAttribute("href", "/issues");
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("offers a signed-out visitor a sign-in link back to the issue (#457)", async () => {
    authMock.mockResolvedValue(null);
    render(await IssueNotFound());
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?callbackUrl=%2Fissues%2FZE-12");
    expect(screen.getByText(/only visible after you sign in/)).toBeInTheDocument();
  });

  it("keeps a comment permalink's query in the sign-in callback (#457)", async () => {
    authMock.mockResolvedValue(null);
    searchParamsMock.mockReturnValueOnce(new URLSearchParams("comment=c9"));
    render(await IssueNotFound());
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encodeURIComponent("/issues/ZE-12?comment=c9")}`,
    );
  });

  it("falls back to a plain sign-in link off an issue path", async () => {
    authMock.mockResolvedValue(null);
    pathnameMock.mockReturnValueOnce("/elsewhere");
    render(await IssueNotFound());
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
