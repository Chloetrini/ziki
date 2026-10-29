import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #616: goal budgets add the `Goal` entity and its pool allocations. The
 * migration must stay additive — the team ships it against databases that
 * already hold real accounts — so these checks lock the schema and migration
 * down.
 */

const migration = readFileSync(
  "prisma/migrations/20261027000000_add_goal_budgets/migration.sql",
  "utf8",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("goal budgets migration is additive-only (#616)", () => {
  it("creates the Goal and GoalAllocation tables", () => {
    expect(migration).toContain('CREATE TABLE "Goal"');
    expect(migration).toContain('CREATE TABLE "GoalAllocation"');
  });

  it("never drops a table, column, index, or constraint", () => {
    // Strip comments so the ticket's own "never a DROP" note does not match.
    const statements = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|TYPE)\b/i);
    expect(statements).not.toMatch(/\bTRUNCATE\b/i);
    expect(statements).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("adds the enums, indexes, and foreign keys the schema declares", () => {
    expect(migration).toContain(`CREATE TYPE "GoalStatus"`);
    expect(migration).toContain(`CREATE TYPE "GoalSplitMethod"`);
    expect(migration).toContain(`CREATE TYPE "GoalAllocationTarget"`);
    expect(migration).toContain('CREATE UNIQUE INDEX "GoalAllocation_sourceKey_key"');
    expect(migration).toContain('"GoalAllocation_goalId_fkey"');
  });

  it("keeps allocations idempotent through a goal-scoped unique sourceKey (#505)", () => {
    expect(schema).toMatch(/model GoalAllocation \{[\s\S]*@@unique\(\[goalId, sourceKey\]\)/);
  });

  it("tracks the pool and what has been split off it", () => {
    expect(schema).toMatch(/model Goal \{[\s\S]*budgetPool\s+Int/);
    expect(schema).toMatch(/model Goal \{[\s\S]*allocated\s+Int\s+@default\(0\)/);
  });
});

describe("goal allocation goal-scoped sourceKey migration (#505)", () => {
  const scopedMigration = readFileSync(
    "prisma/migrations/20261130000000_goal_allocation_goal_scoped_source_key/migration.sql",
    "utf8",
  );

  it("drops global unique index and adds goalId-scoped unique index without data loss", () => {
    expect(scopedMigration).toContain('DROP INDEX IF EXISTS "GoalAllocation_sourceKey_key"');
    expect(scopedMigration).toContain('CREATE UNIQUE INDEX "GoalAllocation_goalId_sourceKey_key" ON "GoalAllocation"("goalId", "sourceKey")');
    expect(scopedMigration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(scopedMigration).not.toMatch(/\bDELETE\b/i);
  });
});
