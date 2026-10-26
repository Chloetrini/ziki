// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewStatusBadge } from "./review-status-badge";

afterEach(() => cleanup());

describe("ReviewStatusBadge", () => {
  it("renders null when status is absent", () => {
    const { container } = render(<ReviewStatusBadge status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders In Review for submitted status", () => {
    const { getByTestId } = render(<ReviewStatusBadge status="submitted" />);
    const badge = getByTestId("review-status-badge");
    expect(badge).toHaveTextContent("In Review");
  });

  it("renders Ready to Merge for ready_to_merge status", () => {
    const { getByTestId } = render(<ReviewStatusBadge status="ready_to_merge" />);
    const badge = getByTestId("review-status-badge");
    expect(badge).toHaveTextContent("Ready to Merge");
  });

  it("renders Needs Revision for rejected status", () => {
    const { getByTestId } = render(<ReviewStatusBadge status="rejected" />);
    const badge = getByTestId("review-status-badge");
    expect(badge).toHaveTextContent("Needs Revision");
  });

  it("renders Merged for merged status", () => {
    const { getByTestId } = render(<ReviewStatusBadge status="merged" />);
    const badge = getByTestId("review-status-badge");
    expect(badge).toHaveTextContent("Merged");
  });
});
