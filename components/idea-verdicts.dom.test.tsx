// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const giveIdeaVerdictAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/idea-verdicts", () => ({ giveIdeaVerdictAction }));

import { IdeaScoreBadge, IdeaVerdictsPanel, type IdeaVerdictsData } from "./idea-verdicts";

afterEach(() => cleanup());

const data: IdeaVerdictsData = {
  ideaScore: 2,
  ideaThreshold: 3,
  votes: { good: 3, bad: 1, neutral: 1 },
  verdicts: [
    {
      id: "v1",
      opinion: "good",
      votes: 3,
      summary: "New users get stuck here.",
      description: "The full reasoning behind it.",
      onBehalfOfUserId: "ann",
      by: "Ann",
      agentName: "Scout",
      updatedAt: "2026-10-28T10:00:00Z",
    },
    {
      id: "v2",
      opinion: "bad",
      votes: 1,
      summary: "Out of scope.",
      description: "The full reasoning behind it.",
      onBehalfOfUserId: "ben",
      by: "Ben",
      agentName: null,
      updatedAt: "2026-10-27T10:00:00Z",
    },
  ],
};

const panel = (props: Partial<React.ComponentProps<typeof IdeaVerdictsPanel>> = {}) =>
  render(
    <IdeaVerdictsPanel
      bugId="bug-1"
      data={data}
      viewerId="cy"
      block={null}
      summaryMaxChars={300}
      {...props}
    />,
  );

describe("IdeaVerdictsPanel (#idea-verdicts)", () => {
  beforeEach(() => giveIdeaVerdictAction.mockReset());

  it("shows the score against the threshold and the vote totals", () => {
    panel();
    expect(screen.getByTestId("idea-score")).toHaveTextContent("Score 2 of 3");
    const totals = within(screen.getByLabelText("Idea score"));
    expect(totals.getByTitle("3 good votes")).toHaveTextContent("3 good");
    expect(totals.getByTitle("1 bad vote")).toHaveTextContent("1 bad");
    expect(totals.getByTitle("1 neutral vote")).toHaveTextContent("1 neutral");
  });

  it("lists each verdict with who, the opinion, the votes, the summary and its description", () => {
    panel();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Good");
    expect(items[0]).toHaveTextContent("Ann");
    expect(items[0]).toHaveTextContent("via Scout");
    expect(items[0]).toHaveTextContent("3 votes");
    expect(items[0]).toHaveTextContent("New users get stuck here.");
    expect(items[0]).toHaveTextContent("The full reasoning behind it.");
    // A verdict is the whole entry: there is no comment to link to.
    expect(within(items[0]).queryByRole("link")).toBeNull();
    expect(items[1]).toHaveTextContent("Bad");
  });

  it("says so when the threshold is reached", () => {
    panel({ data: { ...data, ideaScore: 3 } });
    expect(screen.getByText(/reached the threshold/)).toBeInTheDocument();
  });

  it("hides the form on your own idea and says why", () => {
    panel({ block: "own" });
    expect(screen.queryByRole("form", { name: "Your verdict" })).toBeNull();
    expect(screen.getByTestId("idea-verdict-blocked")).toHaveTextContent("This is your idea, so you can't give it a verdict.");
  });

  it("prefills the viewer's earlier verdict and offers to change it", () => {
    panel({ viewerId: "ben" });
    const form = screen.getByRole("form", { name: "Your verdict" });
    expect(within(form).getByRole("radio", { name: "Bad" })).toBeChecked();
    expect(within(form).getByLabelText("Summary")).toHaveValue("Out of scope.");
    expect(within(form).getByRole("button", { name: "Update verdict" })).toBeInTheDocument();
  });

  it("counts the summary's characters left", () => {
    panel();
    const summary = screen.getByLabelText("Summary");
    expect(screen.getByText(/300/).parentElement).toHaveTextContent("Two sentences at most. 300 characters left.");
    fireEvent.change(summary, { target: { value: "Nice." } });
    expect(screen.getByText(/295/).parentElement).toHaveTextContent("295 characters left.");
  });

  it("checks the form before sending, then sends the verdict", async () => {
    giveIdeaVerdictAction.mockResolvedValue({ ok: true, replaced: false });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Give verdict" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick good, bad or neutral.");

    fireEvent.click(screen.getByRole("radio", { name: "Good" }));
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "One. Two. Three." } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Because." } });
    fireEvent.click(screen.getByRole("button", { name: "Give verdict" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Keep the summary to two sentences.");
    expect(giveIdeaVerdictAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Worth doing." } });
    fireEvent.click(screen.getByRole("button", { name: "Give verdict" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your verdict was saved."));
    const [bugId, sent] = giveIdeaVerdictAction.mock.calls[0] as [string, FormData];
    expect(bugId).toBe("bug-1");
    expect(Object.fromEntries(sent)).toEqual({ opinion: "good", summary: "Worth doing.", description: "Because." });
    expect(screen.getByLabelText("Description")).toHaveValue("");
  });

  it("shows the server's error", async () => {
    giveIdeaVerdictAction.mockResolvedValue({ error: "This idea is closed." });
    panel();
    fireEvent.click(screen.getByRole("radio", { name: "Neutral" }));
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Fine." } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "No strong view." } });
    fireEvent.click(screen.getByRole("button", { name: "Give verdict" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This idea is closed."));
  });
});

describe("IdeaScoreBadge", () => {
  it("labels the number as a score", () => {
    render(<IdeaScoreBadge score={-2} threshold={3} />);
    const badge = screen.getByTestId("idea-score-badge");
    expect(badge).toHaveTextContent("-2score");
    expect(badge).toHaveAttribute("aria-label", "Idea score -2 of 3");
  });
});
