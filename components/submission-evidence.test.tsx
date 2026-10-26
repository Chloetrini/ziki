// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubmissionEvidence } from "./submission-evidence";

afterEach(() => cleanup());

describe("SubmissionEvidence", () => {
  it("renders null when no screenshots or testResults are provided", () => {
    const { container } = render(<SubmissionEvidence />);
    expect(container.firstChild).toBeNull();
  });

  it("renders screenshots when provided", () => {
    const { getByTestId, getAllByRole } = render(
      <SubmissionEvidence screenshots={["https://example.com/screenshot1.png"]} />,
    );
    expect(getByTestId("submission-evidence-section")).toBeInTheDocument();
    const imgs = getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "https://example.com/screenshot1.png");
  });

  it("renders test results when provided as string or object", () => {
    const { getByText } = render(
      <SubmissionEvidence testResults={{ passed: true, suites: 4 }} />,
    );
    expect(getByText(/"passed": true/)).toBeInTheDocument();
  });
});
