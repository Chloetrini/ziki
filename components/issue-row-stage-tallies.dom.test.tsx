// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IssueRowStageTallies } from "./issue-row-stage-tallies";
import { tallyStages } from "@/lib/decision-stages";

afterEach(cleanup);

describe("IssueRowStageTallies (#1446)", () => {
  it("shows each stage with decisions, its ✓ and ✕ counts, and skips empty stages", () => {
    const tallies = tallyStages([
      { kind: "confirmed", count: 8 },
      { kind: "rejected" },
      { kind: "claimed" },
      { kind: "verdict", goodToMerge: true, count: 7 },
    ]);
    const { container } = render(<IssueRowStageTallies tallies={tallies} />);

    expect(screen.getByText("Requires confirmation: 8 positive, 1 negative")).toBeInTheDocument();
    expect(screen.queryByText(/^Idea:/)).not.toBeInTheDocument();
    expect(screen.getByText("Open: 1 positive, 0 negative")).toBeInTheDocument();
    expect(screen.getByText("Done: 7 positive, 0 negative")).toBeInTheDocument();
    expect(screen.queryByText(/^Ready to merge:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Live:/)).not.toBeInTheDocument();
    expect(container).toHaveTextContent("✓8");
    expect(container).toHaveTextContent("✕1");
    // A zero side is left out.
    expect(container).not.toHaveTextContent("✕0");
  });

  it("renders nothing without any decisions", () => {
    const { container } = render(<IssueRowStageTallies tallies={tallyStages([])} />);
    expect(container).toBeEmptyDOMElement();
    const { container: none } = render(<IssueRowStageTallies tallies={undefined} />);
    expect(none).toBeEmptyDOMElement();
  });
});
