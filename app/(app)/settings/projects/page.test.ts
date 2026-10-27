import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

import SettingsProjectsPage from "./page";

describe("SettingsProjectsPage", () => {
  it("redirects to /settings?section=projects", () => {
    SettingsProjectsPage();
    expect(mockRedirect).toHaveBeenCalledWith("/settings?section=projects");
  });
});
