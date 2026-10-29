import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "@/lib/agents/require-agent";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  ideaVerdict: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  bug: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
  pointEntry: { createMany: vi.fn() },
  projectWorkflow: { findUnique: vi.fn() },
}));
const publish = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agent-api/events", () => ({ publish }));
vi.mock("@/lib/agents/audit", () => ({ audit }));

import { convertIdea, giveIdeaVerdict, ideaVerdictSchema, maxVotesFor, sentenceCount, verdictScore } from "./idea-verdicts";

const idea = (overrides: Record<string, unknown> = {}) => ({
  id: "b1",
  tenantId: "t1",
  projectId: "p1",
  status: "open",
  reporterId: "ada",
  beneficiaryUserId: "ada",
  convertedToIssueAt: null,
  createdByOwnerId: "ada",
  ...overrides,
});

const input = { opinion: "good" as const, summary: "Useful. It saves a click.", description: "The activity list is long; an icon would keep the page short." };
const person = { tenantId: "t1", userId: "bob" };

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((run: (tx: unknown) => unknown) => run(db));
  db.$queryRaw.mockResolvedValue([idea()]);
  db.ideaVerdict.findUnique.mockResolvedValue(null);
  db.ideaVerdict.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "v1", ...create }));
  db.ideaVerdict.findMany.mockResolvedValue([{ opinion: "good", votes: 1 }]);
  db.pointEntry.createMany.mockResolvedValue({ count: 1 });
  db.projectWorkflow.findUnique.mockResolvedValue(null);
});

describe("the verdict rules", () => {
  it("counts sentences and keeps summaries to two", () => {
    expect(sentenceCount("One. Two!")).toBe(2);
    expect(sentenceCount("Version 2.5 is fine.")).toBe(1);
    expect(ideaVerdictSchema.safeParse({ ...input, summary: "One. Two. Three." }).success).toBe(false);
    expect(ideaVerdictSchema.safeParse({ ...input, summary: "x".repeat(301) }).success).toBe(false);
    expect(ideaVerdictSchema.safeParse({ ...input, description: " " }).success).toBe(false);
    // `comment` was the description's first name; agents that still send it keep working.
    const { description, ...withoutDescription } = input;
    expect(ideaVerdictSchema.parse({ ...withoutDescription, comment: description })).toMatchObject({ description });
    expect(ideaVerdictSchema.safeParse({ ...input, opinion: "great" }).success).toBe(false);
  });

  it("gives managers and mergers up to 5 votes, everyone else 1", () => {
    expect(maxVotesFor(person)).toBe(1);
    expect(maxVotesFor({ ...person, agent: { id: "a", level: "working" } })).toBe(1);
    expect(maxVotesFor({ ...person, agent: { id: "a", level: "manager" } })).toBe(5);
    expect(maxVotesFor({ ...person, agent: { id: "a", level: "merger" } })).toBe(5);
  });

  it("scores good minus bad, neutral adding nothing", () => {
    expect(verdictScore([{ opinion: "good", votes: 5 }, { opinion: "bad", votes: 1 }, { opinion: "neutral", votes: 3 }])).toBe(4);
  });
});

describe("giveIdeaVerdict", () => {
  it("records the verdict with its description, posts no comment, rescores and pays the first point", async () => {
    const result = await giveIdeaVerdict(person, "p1", "b1", input);
    expect(db.ideaVerdict.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ opinion: "good", summary: input.summary, description: input.description }),
    }));
    expect(db.bug.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { ideaScore: 1 } });
    expect(db.pointEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: "bob", role: "idea", points: 1, sourceKey: "idea:b1:bob" })],
      skipDuplicates: true,
    });
    expect(result).toMatchObject({ ideaScore: 1, ideaThreshold: 3, convertible: false, replaced: false, pointsAwarded: 1 });
    expect(publish).toHaveBeenCalledWith(db, expect.objectContaining({ type: "idea.verdict", bugId: "b1" }));
  });

  it("replaces the person's earlier verdict without paying again", async () => {
    db.ideaVerdict.findUnique.mockResolvedValue({ id: "v1" });
    db.pointEntry.createMany.mockResolvedValue({ count: 0 });
    const result = await giveIdeaVerdict(person, "p1", "b1", { ...input, opinion: "bad" });
    expect(result).toMatchObject({ replaced: true, pointsAwarded: 0 });
  });

  it("says when the idea reaches the threshold", async () => {
    db.ideaVerdict.findMany.mockResolvedValue([{ opinion: "good", votes: 5 }]);
    const manager = { ...person, agent: { id: "a-dana", level: "manager" as const } };
    await expect(giveIdeaVerdict(manager, "p1", "b1", { ...input, votes: 5 })).resolves.toMatchObject({ ideaScore: 5, convertible: true });
  });

  it("refuses more votes than the giver may give", async () => {
    await expect(giveIdeaVerdict(person, "p1", "b1", { ...input, votes: 2 })).rejects.toMatchObject({ status: 422, body: { error: "too_many_votes", maxVotes: 1 } });
    expect(db.ideaVerdict.upsert).not.toHaveBeenCalled();
  });

  it("refuses a verdict on your own idea, on an issue and on a closed idea", async () => {
    await expect(giveIdeaVerdict({ ...person, userId: "ada" }, "p1", "b1", input)).rejects.toMatchObject({ status: 403, body: { error: "own_idea" } });
    db.$queryRaw.mockResolvedValue([idea({ convertedToIssueAt: new Date() })]);
    await expect(giveIdeaVerdict(person, "p1", "b1", input)).rejects.toMatchObject({ status: 409, body: { error: "not_an_idea" } });
    db.$queryRaw.mockResolvedValue([idea({ status: "closed" })]);
    await expect(giveIdeaVerdict(person, "p1", "b1", input)).rejects.toMatchObject({ status: 409, body: { error: "idea_closed" } });
    db.$queryRaw.mockResolvedValue([]);
    await expect(giveIdeaVerdict(person, "p1", "b1", input)).rejects.toMatchObject({ status: 404 });
    expect(db.ideaVerdict.upsert).not.toHaveBeenCalled();
  });
});

describe("convertIdea", () => {
  const manager = (level: AgentContext["level"], ownerId = "dana"): AgentContext => ({
    agentId: `agent-${ownerId}`, name: ownerId, ownerId, tenantId: "t1", level, burst: false, keyId: "k1",
  });

  it("converts an idea at the threshold and records who did it", async () => {
    db.bug.findUniqueOrThrow.mockResolvedValue({ ideaScore: 3 });
    const result = await convertIdea(manager("manager"), "p1", "b1");
    expect(result).toMatchObject({ issueId: "b1", ideaScore: 3, ideaThreshold: 3, stage: "confirming" });
    expect(db.bug.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ convertedToIssueAt: expect.any(Date), convertedByAgentId: "agent-dana" }),
    });
    expect(publish).toHaveBeenCalledWith(db, expect.objectContaining({ type: "issue.converted" }));
    expect(audit).toHaveBeenCalledWith(expect.anything(), "idea.converted", "b1", expect.anything(), { bugId: "b1" });
  });

  it("lets a manager agent convert its owner's own idea", async () => {
    db.bug.findUniqueOrThrow.mockResolvedValue({ ideaScore: 3 });
    // ada filed the idea; her manager agent may still convert it.
    await expect(convertIdea(manager("manager", "ada"), "p1", "b1")).resolves.toMatchObject({ issueId: "b1", stage: "confirming" });
  });

  it("needs a manager agent and a score at the threshold", async () => {
    // The route answers this as 403 insufficient_level.
    await expect(convertIdea(manager("working"), "p1", "b1")).rejects.toMatchObject({ name: "AgentLevelError" });
    db.bug.findUniqueOrThrow.mockResolvedValue({ ideaScore: 2 });
    await expect(convertIdea(manager("manager"), "p1", "b1")).rejects.toMatchObject({ status: 409, body: { error: "below_threshold", ideaScore: 2, ideaThreshold: 3 } });
    expect(db.bug.update).not.toHaveBeenCalled();
  });
});
