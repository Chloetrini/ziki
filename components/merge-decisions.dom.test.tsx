// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MergeDecisions } from "./merge-decisions";
import type { AgentDecision } from "./issue-agent-activity";

describe("MergeDecisions", () => {
  beforeEach(() => cleanup());

  it("says no merger has decided yet when there are no merge decisions", () => {
    render(<MergeDecisions decisions={[]} />);

    const section = screen.getByRole("region", { name: /merge decisions/i });
    expect(within(section).getByText("0")).toBeInTheDocument();
    expect(within(section).getByText("No merge decisions yet")).toBeInTheDocument();
    expect(within(section).getByText("Awaiting review by a merger.")).toBeInTheDocument();
    expect(within(section).queryByRole("article")).not.toBeInTheDocument();
  });

  it("shows one entry per merger decision, oldest first, like a conversation", () => {
    const decisions: AgentDecision[] = [
      { id: "accepted-2", at: "2026-01-02T10:00:00.000Z", kind: "accepted", agentName: "merger-two" },
      { id: "accepted-1", at: "2026-01-01T10:00:00.000Z", kind: "accepted", agentName: "merger-one" },
    ];

    render(<MergeDecisions decisions={decisions} />);

    const section = screen.getByRole("region", { name: /merge decisions/i });
    expect(within(section).getByText("2")).toBeInTheDocument();
    expect(within(section).queryByText("No merge decisions yet")).not.toBeInTheDocument();

    const entries = within(section).getAllByRole("article");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveAttribute("id", "agent-decision-accepted-1");
    expect(within(entries[0]).getAllByText("merger-one").length).toBeGreaterThan(0);
    expect(within(entries[0]).getByText("agent")).toBeInTheDocument();
    expect(within(entries[0]).getByText("Good to merge")).toBeInTheDocument();
    expect(entries[0]).toHaveTextContent("accepted the fix and marked this issue resolved.");
    expect(within(entries[1]).getAllByText("merger-two").length).toBeGreaterThan(0);
  });

  it("shows a merger's rejection as not ready to merge, with what they asked to change (#1429)", () => {
    const decisions: AgentDecision[] = [
      { id: "accepted-2", at: "2026-01-02T10:00:00.000Z", kind: "accepted", agentName: "merger-two" },
      {
        id: "merge-rejected-1",
        at: "2026-01-01T10:00:00.000Z",
        kind: "merge_rejected",
        agentName: "merger-one",
        notes: "Edge-case tests are missing.",
      },
    ];

    render(<MergeDecisions decisions={decisions} />);

    const entries = screen.getAllByRole("article");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveAttribute("id", "agent-decision-merge-rejected-1");
    expect(within(entries[0]).getByText("Not ready to merge")).toBeInTheDocument();
    expect(entries[0]).toHaveTextContent("rejected the fix and asked for changes before it can merge.");
    expect(within(entries[0]).getByText("Edge-case tests are missing.")).toBeInTheDocument();
    expect(within(entries[1]).getByText("Good to merge")).toBeInTheDocument();
  });
});
