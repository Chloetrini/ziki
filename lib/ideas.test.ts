import { describe, expect, it } from "vitest";
import { formatStructuredDescription, isUnstructuredDraft } from "./ideas";

describe("Drafted ideas (#1162)", () => {
  it("identifies unstructured human drafts correctly", () => {
    // Human submission with quick unstructured notes
    expect(
      isUnstructuredDraft({
        createdByAgentId: null,
        description: "Can we add a dark mode toggle to the top right of the navigation?",
      }),
    ).toBe(true);

    // Agent submission is never treated as a human draft
    expect(
      isUnstructuredDraft({
        createdByAgentId: "agent_123",
        description: "Quick bug report without headings",
      }),
    ).toBe(false);

    // Fully structured report with standard headings is not an unstructured draft
    expect(
      isUnstructuredDraft({
        createdByAgentId: null,
        description: `## Summary\nDark mode toggle.\n\n## Problem Statement\nMissing dark mode.\n\n## Acceptance Criteria\n- [ ] Toggle exists`,
      }),
    ).toBe(false);
  });

  it("formats unstructured drafts into standard specification markdown", () => {
    const raw = "Add an export button to issues list so we can export CSV";
    const structured = formatStructuredDescription(raw, {
      summary: "CSV export button on issues list",
      problem: "Users cannot export issues to CSV.",
      proposedSolution: "Add Export CSV button beside the filter controls.",
      acceptanceCriteria: ["Export CSV button renders", "Clicks trigger download"],
    });

    expect(structured).toContain("## Summary\nCSV export button on issues list");
    expect(structured).toContain("## Problem Statement\nUsers cannot export issues to CSV.");
    expect(structured).toContain("## Proposed Solution\nAdd Export CSV button beside the filter controls.");
    expect(structured).toContain("## Acceptance Criteria\n- [ ] Export CSV button renders\n- [ ] Clicks trigger download");

    // The output is now recognized as structured, so it moves out of drafts
    expect(isUnstructuredDraft({ createdByAgentId: null, description: structured })).toBe(false);
  });
});
