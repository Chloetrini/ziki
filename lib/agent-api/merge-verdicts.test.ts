import { describe, expect, it } from "vitest";
import { countedMergeVerdicts, type CountableVerdict } from "./merge-verdicts";

const reviewed = { reporterId: "ada", beneficiaryUserId: "ada", createdByAgentId: null, claims: [] };
const verdict = (owner: string, headSha: string | null = null, agentId = `agent-${owner}`): CountableVerdict => ({
  headSha,
  onBehalfOfUserId: owner,
  agent: { id: agentId, ownerUserId: owner },
});

describe("countedMergeVerdicts: one verdict rule for the merge gate and the merge queue", () => {
  it("counts one verdict per independent owner and names the last counted commit", () => {
    const { reviewers, acceptedHeadSha } = countedMergeVerdicts(
      [verdict("bob", "sha-1"), verdict("bob", "sha-2", "agent-bob-2"), verdict("cara", "sha-3")],
      null,
      reviewed,
      "linked-sha",
    );
    expect(reviewers).toEqual(["bob", "cara"]);
    expect(acceptedHeadSha).toBe("sha-3");
  });

  it("skips the claim holder's agent and owner", () => {
    const claim = { agentId: "agent-dan", agent: { ownerUserId: "dan" } };
    const { reviewers } = countedMergeVerdicts([verdict("dan"), verdict("dan", null, "agent-dan-2"), verdict("bob")], claim, reviewed);
    expect(reviewers).toEqual(["bob"]);
  });

  it("skips reviewers the independence rules exclude, such as the reporter", () => {
    const { reviewers, acceptedHeadSha } = countedMergeVerdicts([verdict("ada", "sha-x"), verdict("bob")], null, reviewed, "linked-sha");
    expect(reviewers).toEqual(["bob"]);
    expect(acceptedHeadSha).toBe("linked-sha");
  });
});
