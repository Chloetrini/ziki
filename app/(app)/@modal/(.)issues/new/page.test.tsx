import { describe, expect, it, vi } from "vitest";

const loadReportFormData = vi.fn();
vi.mock("../../../issues/new/load-form-data", () => ({ loadReportFormData: () => loadReportFormData() }));
vi.mock("@/components/report-issue-modal", () => ({ ReportIssueModal: (props: unknown) => props }));

import ReportIssueModalRoute from "./page";

const data = {
  user: { id: "u1" },
  admin: false,
  users: [],
  assigneeUsers: [],
  categories: [],
  types: [],
  projectId: "p1",
};

async function propsFor(from: string | string[] | undefined) {
  loadReportFormData.mockResolvedValue(data);
  const element = await ReportIssueModalRoute({ searchParams: Promise.resolve({ from }) });
  return (element as { props: Record<string, unknown> }).props;
}

describe("intercepted /issues/new route (#report-modal)", () => {
  it("opens the modal with the form data and the page it came from", async () => {
    const props = await propsFor("/issues/42");
    expect(props).toMatchObject({ currentUserId: "u1", projectId: "p1", isAdmin: false, reportedFrom: "/issues/42" });
  });

  it("drops an unsafe or missing from page", async () => {
    expect((await propsFor("https://evil.example")).reportedFrom).toBeNull();
    expect((await propsFor(undefined)).reportedFrom).toBeNull();
    expect((await propsFor(["/dashboard", "/x"])).reportedFrom).toBe("/dashboard");
  });
});
