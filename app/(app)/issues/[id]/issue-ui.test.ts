import { describe, expect, it } from "vitest";
import { reviewStatusChipClass, reviewStatusLabels } from "./issue-ui";

describe("review status chips", () => {
  it("has a colour for every status it labels", () => {
    expect(Object.keys(reviewStatusChipClass).sort()).toEqual(Object.keys(reviewStatusLabels).sort());
  });

  it("shows blocked and failed merges in red and a merged fix in purple", () => {
    expect(reviewStatusChipClass.merge_blocked).toMatch(/\brose-/);
    expect(reviewStatusChipClass.merge_failed).toMatch(/\brose-/);
    expect(reviewStatusChipClass.merged).toMatch(/\bpurple-/);
  });

  it("uses no `dark:` variants: theme-dark.css already mirrors the palette for the chosen theme", () => {
    // `dark:` follows the device, not Ziki's theme, and would flip the mirrored colour twice.
    for (const [status, classes] of Object.entries(reviewStatusChipClass)) {
      expect(classes, status).not.toContain("dark:");
    }
  });
});
