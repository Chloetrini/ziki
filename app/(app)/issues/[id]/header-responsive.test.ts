import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");

describe("Bug detail header responsive layout (#698)", () => {
  it("renders a compact mobile action row pinned directly under the title before the votes", () => {
    expect(pageSource).toMatch(
      /<h1[\s\S]*?<\/h1>[\s\S]*?data-testid="mobile-actions-row"[\s\S]*?<VoteButton/
    );

    const mobileRowMatch = pageSource.match(
      /data-testid="mobile-actions-row"[\s\S]*?className="([^"]+)"/
    );
    expect(mobileRowMatch).toBeTruthy();
    const mobileClasses = mobileRowMatch![1];
    expect(mobileClasses).toContain("overflow-x-auto");
    expect(mobileClasses).toContain("sm:hidden");
    expect(mobileClasses).toContain("flex");
    expect(mobileClasses).toContain("gap-2");
  });

  it("includes SelfAssignButton in the header action row so Assign is immediately reachable", () => {
    expect(pageSource).toMatch(
      /headerActions[\s\S]*?canSelfAssign[\s\S]*?<SelfAssignButton/
    );
  });

  it("shows status, severity, stage and the opened date together in the rail's Status box", () => {
    const rail = pageSource.slice(pageSource.indexOf("{/* SIDE RAIL */}"));
    const statusBox = rail.slice(rail.indexOf('aria-label="Status"'), rail.indexOf(">People<"));
    expect(statusBox).toContain("issueStatusChipClass[bug.status]");
    expect(statusBox).toContain("issueSeverityChipClass[bug.severity]");
    expect(statusBox).toContain("issueStageLabels[intakeStage]");
    expect(statusBox).toMatch(/Opened[\s\S]*?<LocalTime compact date=\{bug\.createdAt\}/);
  });

  it("anchors the desktop action cluster to the title's top edge (#687, #451)", () => {
    expect(pageSource).toContain(
      '<div className="flex shrink-0 flex-wrap items-center gap-2 self-start print:hidden">'
    );
    expect(pageSource).toContain("Back to issues");

    expect(pageSource).toMatch(/Danger zone[\s\S]*?<DeleteIssueButton/);
  });

  it("places an accessible back link to the issues list (#451)", () => {
    expect(pageSource).toMatch(
      /href="\/issues"[\s\S]*?aria-label="Back to issues"/
    );
  });
});

describe("Bug detail header hierarchy (#687)", () => {
  it("keeps the taxonomy chips in the header, away from the workflow badges", () => {
    const header = pageSource.slice(0, pageSource.indexOf("{/* SIDE RAIL */}"));
    expect(header).toMatch(/bug\.type\.name[\s\S]*?bug\.category\.name/);
    expect(header).not.toContain("issueSeverityChipClass[bug.severity]");
  });

  it("drops the redundant score pill so only VoteButton shows the vote total", () => {
    expect(pageSource).not.toMatch(/score \(\{/);
    expect(pageSource).not.toMatch(/\{bug\.voteCount\} score/);
  });

  it("uses a main column and side rail layout", () => {
    expect(pageSource).toContain("flex-[999_1_600px]");
    expect(pageSource).toContain("flex-[1_1_340px]");
    // The progress report and the Conversation's stage summary sit in the main column (#1446, #186); the GitHub PR box sits in the rail under People.
    const main = pageSource.slice(pageSource.indexOf("{/* MAIN COLUMN */}"), pageSource.indexOf("{/* SIDE RAIL */}"));
    expect(main).toContain("<IssueProgressReport");
    expect(main).toContain("<IssueStageSummary");
    const rail = pageSource.slice(pageSource.indexOf("{/* SIDE RAIL */}"));
    expect(rail.indexOf(">People<")).toBeGreaterThan(-1);
    expect(rail.indexOf("<EditableProofLinks")).toBeGreaterThan(rail.indexOf(">People<"));
    expect(pageSource).not.toContain("IssueSectionTabs");
  });
});

describe("Idea page (#idea-verdicts)", () => {
  it("shows the idea's score in place of the upvote button while it is an idea", () => {
    expect(pageSource).toContain("const isIdea = bug.convertedToIssueAt === null;");
    expect(pageSource).toMatch(/\{isIdea \?[\s\S]*?ideaScoreText\([\s\S]*?\) : \([\s\S]*?<VoteButton/);
  });

  it("shows the Idea verdicts panel in the main column, only for an idea", () => {
    const main = pageSource.slice(pageSource.indexOf("{/* MAIN COLUMN */}"), pageSource.indexOf("{/* SIDE RAIL */}"));
    expect(main).toMatch(/\{isIdea \? \(\s*ideaVerdicts \? \(\s*<IdeaVerdictsPanel/);
    expect(pageSource).toMatch(/isIdea && !bug\.isDeleted\s*\?\s*await loadOptional<IdeaVerdictsData \| null>\("idea verdicts"/);
  });

  it("puts an idea's verdicts where an issue's conversation goes: no comments on an idea", () => {
    expect(pageSource).toMatch(/<IdeaVerdictsPanel[\s\S]*?\) : null\s*\) : \(\s*<section\s+id="conversation"/);
    expect(pageSource).toMatch(/if \(!isIdea\) \{\s*for \(const comment of commentTree\)/);
  });

  it("only lets an issue be assigned once converted", () => {
    expect(pageSource).toContain("converted: bug.convertedToIssueAt !== null,");
  });
});
