import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { PAGE_CONTAINER_CLASS } from "./page-container";

const read = (path: string) => readFileSync(path, "utf8");

describe("page container token (#415)", () => {
  it("defines one width and one padding", () => {
    expect(PAGE_CONTAINER_CLASS).toContain("mx-auto");
    expect(PAGE_CONTAINER_CLASS).toContain("w-full");
    expect(PAGE_CONTAINER_CLASS).toContain("max-w-6xl");
    expect(PAGE_CONTAINER_CLASS).toContain("px-4");
  });

  it("aligns the signed-in header and main, and keeps the preview on the shared width", () => {
    const layout = read("app/(app)/layout.tsx");
    const header = read("components/app-header.tsx");
    // The header row and main are both centred on the shared width, so page
    // content lines up with the nav bar's edges.
    expect(header).toContain("${PAGE_CONTAINER_CLASS} flex flex-wrap");
    expect(layout).toContain("${PAGE_CONTAINER_CLASS} min-w-0 flex-1");
    expect(layout).not.toContain("max-w-7xl");
    expect(header).not.toContain("max-w-7xl");
    expect(layout).not.toContain("AppSidebar");
  });

  it("leaves no ad-hoc page wrapper on the routes named in the ticket", () => {
    // `settings/agents/connect` and `projects/[slug]/settings` from the
    // original ticket no longer exist on main (consolidated into `pair` and
    // the project list), so the guard covers the routes that still do.
    const routes = [
      "app/(app)/issues/(list)/page.tsx",
      "app/(app)/leaderboard/page.tsx",
      "app/(app)/agents/page.tsx",
      "app/(app)/points/disputes/page.tsx",
    ];

    for (const route of routes) {
      expect(read(route), route).not.toMatch(/mx-auto max-w-\d+xl/);
    }
  });

  it("keeps the issue description at a readable measure inside the container", () => {
    expect(read("components/editable-issue-description.tsx")).toMatch(/className="[^"]*\bmax-w-3xl\b/);
  });
});
