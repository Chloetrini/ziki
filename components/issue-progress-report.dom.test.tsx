// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CommentNode } from "@/lib/comments";
import type { AgentDecision } from "./issue-agent-activity";
import { stageOfComment, stageStarts, type DecisionStage } from "@/lib/decision-stages";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/actions/comments", () => ({
  deleteCommentAction: vi.fn(),
  updateCommentAction: vi.fn(),
  createCommentAction: vi.fn(),
}));
vi.mock("@/components/comment-form", () => ({
  CommentForm: () => <form aria-label="Add comment" />,
}));

import { IssueProgressReport } from "./issue-progress-report";
import { IssueStageProvider } from "./issue-stage-context";
import { StageCommentThread, StageConversationCount } from "./stage-comment-thread";

afterEach(cleanup);

const decisions: AgentDecision[] = [
  { id: "v1", at: "2026-10-21T21:30:00.000Z", kind: "confirmed", agentName: "Otter Reviewer", personName: "Ada", severity: "medium" },
  { id: "v2", at: "2026-10-21T21:12:00.000Z", kind: "rejected", agentName: "Sentinel", personName: "Bo", notes: "Possible duplicate of #422." },
  { id: "c1", at: "2026-10-22T16:08:00.000Z", kind: "claimed", agentName: "Quantum", personName: "Abuchi" },
  { id: "t1", at: "2026-10-22T17:18:00.000Z", kind: "verdict", agentName: "Mira", personName: "Ada", goodToMerge: true },
  { id: "t2", at: "2026-10-23T23:31:00.000Z", kind: "verdict", agentName: "David", personName: "Bo", goodToMerge: false },
  { id: "m1", at: "2026-10-25T09:40:00.000Z", kind: "accepted", agentName: "Merger Agent" },
  { id: "d1", at: "2026-10-25T10:20:00.000Z", kind: "deploy_failed", agentName: "Admin-Merger", reason: "The migration timed out." },
  { id: "d2", at: "2026-10-25T11:05:00.000Z", kind: "accepted", agentName: "Admin-Merger", merged: true },
];

function comment(id: string, type: CommentNode["type"], body: string, createdAt: string): CommentNode {
  return {
    id,
    authorId: "u1",
    parentId: null,
    body,
    type,
    createdAt,
    depth: 0,
    author: { name: "Someone", role: "user" },
    parent: null,
    children: [],
  };
}

const comments = [
  comment("k1", "review", "Idea review comment", "2026-10-21T20:00:00.000Z"),
  comment("k2", "bid", "Bid comment", "2026-10-22T13:00:00.000Z"),
  comment("k3", "review", "Fix review comment", "2026-10-23T17:00:00.000Z"),
  comment("k4", "comment", "Plain comment after the claim", "2026-10-22T16:30:00.000Z"),
];

function renderPage(list: AgentDecision[], stage: DecisionStage, threadComments = comments) {
  const starts = stageStarts(list);
  const counts: Record<DecisionStage, number> = { idea: 0, open: 0, done: 0, ready: 0, live: 0 };
  for (const c of threadComments) counts[stageOfComment(c.type, c.createdAt, starts)] += 1;
  return render(
    <IssueStageProvider initialStage={stage}>
      <IssueProgressReport decisions={list} currentStage={stage} commentCounts={counts} />
      <h2>
        Conversation <span data-testid="conv-count"><StageConversationCount counts={counts} fallback={threadComments.length} /></span>
      </h2>
      <StageCommentThread
        bugId="b1"
        issueUrl="https://example.com/issues/1"
        reporterId="u1"
        users={[]}
        comments={threadComments}
        stage={stage}
        stageStarts={starts}
      />
    </IssueStageProvider>,
  );
}

const decisionsCard = () => within(screen.getByRole("region", { name: /Agent decisions/ }));
const stageButton = (label: RegExp) => screen.getByRole("button", { name: label });

describe("IssueProgressReport (#1446)", () => {
  it("opens on the active stage with its decision cards and comments only", () => {
    renderPage(decisions, "done");

    expect(stageButton(/^Done/)).toHaveAttribute("aria-pressed", "true");
    expect(stageButton(/^Idea/)).toHaveAttribute("aria-pressed", "false");

    expect(decisionsCard().getByText("Good to merge")).toBeInTheDocument();
    expect(decisionsCard().getByText("Not good to merge")).toBeInTheDocument();
    expect(decisionsCard().getAllByText("agent")).toHaveLength(2);
    expect(decisionsCard().queryByText("Confirmed")).not.toBeInTheDocument();

    expect(screen.getByText("Fix review comment")).toBeInTheDocument();
    expect(screen.queryByText("Idea review comment")).not.toBeInTheDocument();
    expect(screen.queryByText("Plain comment after the claim")).not.toBeInTheDocument();
    expect(screen.getByTestId("conv-count")).toHaveTextContent("1");
  });

  it("shows the stage's log count and keeps ✓/✕ for screen readers", () => {
    renderPage(decisions, "done");
    expect(stageButton(/^Idea/)).toHaveTextContent("2 logs");
    expect(screen.getByText("Idea: 1 positive, 1 negative")).toBeInTheDocument();
    expect(screen.getByText("Ready to merge: 1 positive, 1 negative")).toBeInTheDocument();
  });

  it("lists merger and admin-merger decisions under Agent decisions", () => {
    renderPage(decisions, "live");
    expect(decisionsCard().getByText("Deployed")).toBeInTheDocument();
    fireEvent.click(stageButton(/^Ready to merge/));
    expect(decisionsCard().getByText("Ready to merge")).toBeInTheDocument();
    expect(decisionsCard().getByText("Deployment failed")).toBeInTheDocument();
    expect(decisionsCard().getByText("Deployment failed: The migration timed out.")).toBeInTheDocument();
  });

  it("puts a plain comment in the stage it was posted in and switches both cards", () => {
    renderPage(decisions, "done");
    fireEvent.click(stageButton(/^Open/));

    expect(decisionsCard().getByText("Claimed")).toBeInTheDocument();
    expect(screen.getByText("Plain comment after the claim")).toBeInTheDocument();
    expect(screen.getByText("Bid comment")).toBeInTheDocument();
    expect(screen.queryByText("Fix review comment")).not.toBeInTheDocument();
    expect(screen.getByTestId("conv-count")).toHaveTextContent("2");
  });

  it("shows the design's empty Idea stage when there are no logs or comments", () => {
    renderPage([], "idea", []);

    expect(stageButton(/^Idea/)).toHaveTextContent("0 logs");
    expect(stageButton(/^Live/)).toHaveTextContent("not yet");
    expect(decisionsCard().getByText("No idea reviews yet")).toBeInTheDocument();
    expect(decisionsCard().getByText("Reviewer agents confirm or reject the idea here.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No comments at the Idea stage yet.");
    // The stage chip and tabs stay visible while empty.
    expect(screen.getByText("Idea stage", { selector: ".stage-pill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByTestId("conv-count")).toHaveTextContent("0");
  });
});
