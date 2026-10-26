// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IssueRowStatus } from "./issue-row-status";
import { ElapsedTime, formatElapsed } from "./elapsed-time";
import { renderToString } from "react-dom/server";

afterEach(() => cleanup());

const base = { status: "open", stage: undefined, botConfirmations: 0, votes: 0, work: null } as const;
const text = (ui: React.ReactElement) => render(ui).container.textContent?.replace(/\s+/g, " ").trim();

describe("IssueRowStatus", () => {
  it("calls a reported issue an Idea", () => {
    expect(text(<IssueRowStatus {...base} stage="reported" />)).toBe("Idea");
  });

  it("shows Confirming with upvotes against the threshold, and the bots in the label", () => {
    const { container } = render(<IssueRowStatus {...base} stage="confirmed" votes={2} botConfirmations={2} />);
    expect(container.textContent).toContain("Confirming… (2/3)");
    expect(container.textContent).toContain("Confirmed by 2 bots");
    expect(container.querySelector("[title]")?.getAttribute("title")).toContain("2 of 3 upvotes");
  });

  it("never shows more upvotes than the threshold", () => {
    expect(text(<IssueRowStatus {...base} stage="confirmed" votes={7} botConfirmations={1} />)).toContain("(3/3)");
  });

  it("says Ready for bids once confirmed with enough upvotes", () => {
    expect(text(<IssueRowStatus {...base} stage="ready" votes={3} />)).toBe("Ready for bids");
  });

  it("shows who is working, a hammer, and how long on a second line", () => {
    const since = new Date(Date.now() - (2 * 60 + 14) * 60_000);
    const { container } = render(<IssueRowStatus {...base} status="in_progress" work={{ person: "Cara QA", since }} />);
    expect(container.querySelector(".hammering")).not.toBeNull();
    expect(container.textContent).toContain("Cara QA");
    expect(container.textContent).toContain("is working on it");
    expect(container.querySelector("time")?.textContent).toBe("2h 14m");
  });

  it("leaves the timer out when the start time is unknown", () => {
    const { container } = render(<IssueRowStatus {...base} status="in_progress" work={{ person: "Ada", since: null }} />);
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).toContain("Ada");
  });

  it("labels finished issues", () => {
    expect(text(<IssueRowStatus {...base} status="resolved" />)).toBe("Resolved");
    cleanup();
    expect(text(<IssueRowStatus {...base} status="closed" />)).toBe("Closed");
  });

  it("renders fine-grained SDLC review statuses", () => {
    expect(text(<IssueRowStatus {...base} status="in_progress" reviewStatus="submitted" />)).toContain("PR Submitted");
    cleanup();
    expect(text(<IssueRowStatus {...base} status="in_progress" reviewStatus="ready_to_merge" />)).toContain("Ready to Merge");
    cleanup();
    expect(text(<IssueRowStatus {...base} status="in_progress" reviewStatus="rejected" />)).toContain("Needs Revision");
  });
});

describe("formatElapsed", () => {
  it.each([
    [45_000, "45s"],
    [12 * 60_000, "12m"],
    [(2 * 60 + 14) * 60_000, "2h 14m"],
    [(3 * 24 + 4) * 3_600_000, "3d 4h"],
    [-5_000, "0s"],
  ])("%d ms → %s", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});

describe("ElapsedTime tooltip", () => {
  const since = new Date("2026-10-20T10:00:00Z");

  it("leaves the tooltip out of the server render, so no server time zone leaks in", () => {
    expect(renderToString(<ElapsedTime since={since} />)).not.toContain("title=");
  });

  it("fills it in the browser with the viewer's local time", () => {
    const { container } = render(<ElapsedTime since={since} />);
    expect(container.querySelector("time")).toHaveAttribute("title", `Working since ${since.toLocaleString()}`);
  });
});
