import { describe, expect, it } from "vitest";
import { confirmationCount, intakeKind, isConfirmedCount, isConvertible, issueStage, parseIssueStageView } from "./issue-stage";

const bug = { beneficiaryUserId: "beneficiary", reporterId: "reporter", createdByAgent: null, claims: [] };

describe("issueStage", () => {
  it("calls every open report an idea until a manager agent converts it, confirmed or not", () => {
    expect(issueStage({ status: "open", converted: false, confirmed: false })).toBe("idea");
    expect(issueStage({ status: "open", converted: false, confirmed: true })).toBe("idea");
  });

  it("calls a converted issue confirming until reviewers confirm it, then ready", () => {
    expect(issueStage({ status: "open", converted: true, confirmed: false })).toBe("confirming");
    expect(issueStage({ status: "open", converted: true, confirmed: true })).toBe("ready");
  });

  it("leaves the work status alone once someone starts it", () => {
    expect(issueStage({ status: "in_progress", converted: true, confirmed: true })).toBeNull();
    expect(issueStage({ status: "resolved", converted: false, confirmed: false })).toBeNull();
  });
});

describe("isConvertible", () => {
  it("lets a manager agent convert an open idea at or past the threshold", () => {
    expect(isConvertible({ status: "open", converted: false, ideaScore: 3 }, 3)).toBe(true);
    expect(isConvertible({ status: "open", converted: false, ideaScore: 2 }, 3)).toBe(false);
    expect(isConvertible({ status: "open", converted: true, ideaScore: 9 }, 3)).toBe(false);
    expect(isConvertible({ status: "closed", converted: false, ideaScore: 9 }, 3)).toBe(false);
  });
});

describe("confirmationCount", () => {
  it("excludes legacy reviews credited to the reporter from displayed confirmation counts", () => {
    expect(confirmationCount({
      createdByAgentId: "filer", undoneIds: new Set(), bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one", onBehalfOfUserId: "reporter" },
        { id: "v2", agentId: "b", ownerUserId: "two", onBehalfOfUserId: "two" },
      ],
    })).toBe(1);
  });
  it("confirms on two independent owners", () => {
    const count = confirmationCount({
      createdByAgentId: "filer",
      undoneIds: new Set(),
      bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one" },
        { id: "v2", agentId: "b", ownerUserId: "two" },
      ],
    });
    expect(count).toBe(2);
    expect(isConfirmedCount(count)).toBe(true);
  });

  it("does not confirm two accepts from the same owner, the filer, or an undone review", () => {
    const count = confirmationCount({
      createdByAgentId: "filer",
      undoneIds: new Set(["gone"]),
      bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one" },
        { id: "v2", agentId: "b", ownerUserId: "one" },
        { id: "own", agentId: "filer", ownerUserId: "three" },
        { id: "gone", agentId: "c", ownerUserId: "four" },
        { id: "self", agentId: "d", ownerUserId: "reporter" },
      ],
    });
    expect(isConfirmedCount(count)).toBe(false);
  });
});

describe("intake", () => {
  it("is an idea until converted, and an issue after, whatever its status", () => {
    expect(intakeKind({ converted: false })).toBe("idea");
    expect(intakeKind({ converted: true })).toBe("issue");
  });
});

describe("parseIssueStageView", () => {
  it("takes the stage names, and the names links used before ideas took verdicts", () => {
    expect(parseIssueStageView("idea")).toBe("idea");
    expect(parseIssueStageView("confirming")).toBe("confirming");
    expect(parseIssueStageView("ready")).toBe("ready");
    expect(parseIssueStageView("reported")).toBe("idea");
    expect(parseIssueStageView("confirmed")).toBe("confirming");
    expect(parseIssueStageView("queued")).toBeNull();
    expect(parseIssueStageView(undefined)).toBeNull();
  });
});
