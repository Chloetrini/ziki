import { describe, expect, it, vi } from "vitest";
import { award, awardDispatcher, awardSolver, solverAward } from "./award";

/** An in-memory ledger with the unique `sourceKey` the database enforces. */
function fakeLedger() {
  const rows: Array<Record<string, unknown>> = [];
  const createMany = vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    let count = 0;
    for (const row of data) {
      if (rows.some((r) => r.sourceKey === row.sourceKey)) continue;
      rows.push(row);
      count++;
    }
    return { count };
  });
  return { rows, db: { pointEntry: { createMany } } as never, createMany };
}

const issue = { id: "bug-1", tenantId: "tenant-zedu", severity: "high" as const, assigneeId: "user-1" };

describe("points ledger (#428)", () => {
  it("pays the dispatcher 2 points only once per completed issue, including reassignment", async () => {
    const { db, rows } = fakeLedger();
    expect(await awardDispatcher(db, { id: "bug-1", tenantId: "tenant-zedu" }, "dispatcher-owner")).toBe(true);
    expect(await awardDispatcher(db, { id: "bug-1", tenantId: "tenant-zedu" }, "dispatcher-owner")).toBe(false);
    expect(await awardDispatcher(db, { id: "bug-1", tenantId: "tenant-zedu" }, "another-owner")).toBe(false);
    expect(rows).toEqual([{
      tenantId: "tenant-zedu", bugId: "bug-1", userId: "dispatcher-owner",
      role: "dispatcher", points: 2, sourceKey: "dispatcher:bug-1",
    }]);
  });

  it("does not pay a dispatcher for unattributed work", async () => {
    const { db, rows } = fakeLedger();
    expect(await awardDispatcher(db, issue, null)).toBe(false);
    expect(rows).toEqual([]);
  });

  it("builds the solver award from severity and assignee", () => {
    expect(solverAward(issue)).toEqual({
      tenantId: "tenant-zedu",
      userId: "user-1",
      bugId: "bug-1",
      role: "solver",
      points: 40,
      sourceKey: "solver:bug-1:user-1",
    });
  });

  it("awards nobody when the issue has no assignee", async () => {
    const { db, createMany } = fakeLedger();
    expect(solverAward({ ...issue, assigneeId: null })).toBeNull();
    expect(await awardSolver(db, { ...issue, assigneeId: null })).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("awards solver points once, even when resolved again", async () => {
    const { db, rows } = fakeLedger();
    expect(await awardSolver(db, issue)).toBe(true);
    expect(await awardSolver(db, issue)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ points: 40, role: "solver" });
  });

  it("uses the severity at resolution time", async () => {
    const { db, rows } = fakeLedger();
    await awardSolver(db, { ...issue, id: "bug-2", severity: "critical" });
    await awardSolver(db, { ...issue, id: "bug-3", severity: "low" });
    expect(rows.map((r) => r.points)).toEqual([60, 15]);
  });

  it("skips duplicates in the database instead of failing", async () => {
    const { db, createMany } = fakeLedger();
    await award(db, { tenantId: "t", userId: "u", bugId: null, role: "reporter", points: 5, sourceKey: "reporter:b:u" });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });
});
