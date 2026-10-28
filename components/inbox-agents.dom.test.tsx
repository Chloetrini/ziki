// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InboxAgents } from "./inbox-agents";

afterEach(cleanup);

const agents = [
  { id: "a1", name: "Scout", status: "waiting" as const, activity: "Waiting for your answer", done: "Last 30 days: 2 confirmed" },
  { id: "a2", name: "Pixel", status: "working" as const, activity: "Working on #2 Filter", done: "Nothing done in the last 30 days" },
];

describe("InboxAgents", () => {
  it("shows one agent at a time and switches with the dots", () => {
    render(<InboxAgents agents={agents} />);
    expect(screen.getByText("Scout")).toBeInTheDocument();
    expect(screen.queryByText("Pixel")).toBeNull();
    expect(screen.getByRole("button", { name: "Work" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Show Pixel" }));
    expect(screen.getByText("Pixel")).toBeInTheDocument();
    expect(screen.getByText("Working on #2 Filter")).toBeInTheDocument();
    // A working agent offers Stop work; still not wired up.
    expect(screen.getByRole("button", { name: "Stop work" })).toHaveAttribute("title", "Coming soon");
    expect(screen.getByRole("button", { name: "Show Pixel" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Manage Pixel" })).toHaveAttribute("href", "/settings/agents");
  });

  it("shows the agent's robot avatar", () => {
    render(<InboxAgents agents={agents} />);
    expect(screen.getByTestId("agent-avatar")).toBeInTheDocument();
  });

  it("has no dots for a single agent, and invites adding one when there are none", () => {
    const { rerender } = render(<InboxAgents agents={agents.slice(0, 1)} />);
    expect(screen.queryByRole("group", { name: "Choose an agent" })).toBeNull();
    rerender(<InboxAgents agents={[]} />);
    expect(screen.getByText(/No agents yet/)).toBeInTheDocument();
  });
});
