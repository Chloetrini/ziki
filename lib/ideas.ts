/**
 * Unstructured draft ideas intake & structuring pipeline (#1162).
 *
 * Captures raw, unstructured ideas submitted by humans and refines them
 * into structured proposals via the instruction structuring pipeline before
 * graduating them into the curated "New ideas" view.
 */

export type IdeaStructureInput = {
  summary?: string;
  problem?: string;
  proposedSolution?: string;
  acceptanceCriteria?: string[];
};

/**
 * Checks whether an issue represents an unstructured draft idea.
 * These are issues filed by a person (createdByAgentId is null) that have
 * not yet been structured into standard markdown specifications.
 */
export function isUnstructuredDraft(bug: {
  createdByAgentId: string | null;
  description: string;
}): boolean {
  if (bug.createdByAgentId !== null) return false;
  const desc = bug.description.toLowerCase();
  const hasStandardHeadings =
    (desc.includes("## summary") || desc.includes("## problem") || desc.includes("## steps to reproduce")) &&
    (desc.includes("## acceptance criteria") || desc.includes("## proposed fix") || desc.includes("## proposed solution") || desc.includes("## expected"));
  return !hasStandardHeadings;
}

/**
 * Formats raw unstructured text into structured markdown specification.
 */
export function formatStructuredDescription(
  rawDescription: string,
  input?: IdeaStructureInput,
): string {
  const lines = rawDescription.trim().split("\n").filter((l) => l.trim().length > 0);
  const fallbackSummary = input?.summary?.trim() || lines[0]?.trim() || "Structured feature proposal";
  const fallbackProblem = input?.problem?.trim() || rawDescription.trim();
  const fallbackSolution =
    input?.proposedSolution?.trim() ||
    "Refined and structured from raw draft proposal into technical specification.";
  const fallbackCriteria =
    input?.acceptanceCriteria && input.acceptanceCriteria.length > 0
      ? input.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")
      : "- [ ] Specification reviewed and verified\n- [ ] Implementation scope defined\n- [ ] Acceptance criteria verified";

  return `## Summary\n${fallbackSummary}\n\n## Problem Statement\n${fallbackProblem}\n\n## Proposed Solution\n${fallbackSolution}\n\n## Acceptance Criteria\n${fallbackCriteria}\n`;
}
