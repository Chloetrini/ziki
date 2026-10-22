// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CommentNode } from "@/lib/comments";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/actions/comments", () => ({
  deleteCommentAction: vi.fn(),
  updateCommentAction: vi.fn(),
  createCommentAction: vi.fn(),
}));
vi.mock("@/components/comment-form", () => ({
  CommentForm: () => <form aria-label="Add comment" />,
}));

import { CommentThread } from "./comment-thread";

const props = {
  bugId: "issue-450",
  issueUrl: "https://example.com/issues/issue-450",
  reporterId: "reporter",
  users: [],
};
const comment: CommentNode = {
  id: "first-comment",
  authorId: "reviewer",
  parentId: null,
  body: "Here is some useful context.",
  type: "comment",
  createdAt: new Date("2026-10-22T00:00:00Z"),
  depth: 0,
  author: { name: "Reviewer", role: "user" },
  parent: null,
  children: [],
};

afterEach(cleanup);

describe("conversation empty state (#450)", () => {
  it("explains an empty conversation and invites a first contribution", () => {
    render(<CommentThread {...props} comments={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No comments yet.");
    expect(screen.getByRole("status")).toHaveTextContent("Agents and reviewers haven’t posted any updates here yet.");
    expect(screen.getByRole("status")).toHaveTextContent("Start the conversation below");
    expect(screen.getByRole("form", { name: "Add comment" })).toBeInTheDocument();
  });

  it("replaces the empty state with the timeline when the first comment arrives", () => {
    const { rerender } = render(<CommentThread {...props} comments={[]} />);
    rerender(<CommentThread {...props} comments={[comment]} />);
    expect(screen.queryByText("No comments yet.")).not.toBeInTheDocument();
    expect(screen.getByText(comment.body)).toBeInTheDocument();
  });

  it("distinguishes an empty filter from an empty conversation", () => {
    render(<CommentThread {...props} comments={[comment]} />);
    fireEvent.click(screen.getByRole("button", { name: "Reviews" }));
    expect(screen.getByText("No timeline entries match this filter.")).toBeInTheDocument();
    expect(screen.queryByText("No comments yet.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText(comment.body)).toBeInTheDocument();
  });

  it("does not invite contributions on a read-only issue", () => {
    render(<CommentThread {...props} comments={[]} readOnly />);
    expect(screen.getByText("No conversation.")).toBeInTheDocument();
    expect(screen.queryByText(/Start the conversation below/)).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});
