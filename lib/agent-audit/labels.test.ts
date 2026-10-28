import { describe, expect, it } from "vitest";
import { agentActionLabel } from "./labels";

describe("agentActionLabel", () => {
  it("puts common actions in plain words", () => {
    expect(agentActionLabel("issue.created")).toBe("Filed");
    expect(agentActionLabel("claim.accepted")).toBe("Claimed");
    expect(agentActionLabel("comment.created")).toBe("Commented on");
  });

  it("spells out an action it doesn't know", () => {
    expect(agentActionLabel("goal.split")).toBe("Goal split");
    expect(agentActionLabel("job.submission.reviewed")).toBe("Job submission reviewed");
  });

  it("never returns an empty label", () => {
    expect(agentActionLabel("")).toBe("Acted");
    expect(agentActionLabel("._")).toBe("Acted");
  });
});
