import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubscriptionRecord, MAX_SUBSCRIPTIONS_PER_AGENT, normalizeSubscriptionEvents } from "./manage";

const db = {
  webhookSubscription: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
  $queryRaw: vi.fn(),
};

const input = {
  agentId: "agent-a",
  url: "https://receiver.test/hook",
  events: ["issue.created"],
  signingSecretEncrypted: "cipher",
};

beforeEach(() => {
  vi.resetAllMocks();
  db.webhookSubscription.count.mockResolvedValue(0);
  db.webhookSubscription.findFirst.mockResolvedValue(null);
  db.webhookSubscription.create.mockResolvedValue({
    id: "sub-a",
    url: input.url,
    enabled: true,
    createdAt: new Date(0),
    events: input.events,
  });
});

describe("webhook subscription limits (#512)", () => {
  it("refuses the fourth subscription for one agent", async () => {
    db.webhookSubscription.count.mockResolvedValue(MAX_SUBSCRIPTIONS_PER_AGENT);
    const result = await createSubscriptionRecord(db as never, input);
    expect(result).toMatchObject({ ok: false, status: 409 });
    if (!result.ok) expect(result.error).toContain("at most 3");
    expect(db.webhookSubscription.create).not.toHaveBeenCalled();
  });

  it("refuses the same URL twice for one agent", async () => {
    db.webhookSubscription.findFirst.mockResolvedValue({ id: "sub-a" });
    const result = await createSubscriptionRecord(db as never, input);
    expect(result).toMatchObject({ ok: false, status: 409 });
    if (!result.ok) expect(result.error).toContain("already subscribed");
    expect(db.webhookSubscription.create).not.toHaveBeenCalled();
  });

  it("stores the event filter with the subscription", async () => {
    const result = await createSubscriptionRecord(db as never, input);
    expect(result).toMatchObject({ ok: true });
    expect(db.webhookSubscription.create.mock.calls[0][0].data).toMatchObject({
      agentId: "agent-a",
      url: input.url,
      events: ["issue.created"],
    });
  });

  it("normalises the filter: trims, drops blanks, dedupes", () => {
    expect(normalizeSubscriptionEvents([" issue.created ", "issue.created", "", "  "])).toEqual([
      "issue.created",
    ]);
    expect(normalizeSubscriptionEvents(undefined)).toEqual([]);
  });

  it("locks the agent row inside a transaction to prevent concurrent cap bypass (#498)", async () => {
    await createSubscriptionRecord(db as never, input);
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it("maps Prisma P2002 unique constraint violation to 409 duplicate error (#498)", async () => {
    db.webhookSubscription.create.mockRejectedValue({ code: "P2002" });
    const result = await createSubscriptionRecord(db as never, input);
    expect(result).toMatchObject({ ok: false, status: 409, error: "That URL is already subscribed for this agent." });
  });

  it("enforces cap and duplicate rejection when concurrent creates fire (#498)", async () => {
    let count = 2;
    const urls = new Set<string>();
    let lock = Promise.resolve();
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const run = lock.then(async () => {
        return fn({
          ...db,
          webhookSubscription: {
            count: vi.fn(async () => count),
            findFirst: vi.fn(async ({ where }: { where: { url: string } }) =>
              urls.has(where.url) ? { id: "existing" } : null,
            ),
            create: vi.fn(async ({ data }: { data: { url: string } }) => {
              if (urls.has(data.url)) throw { code: "P2002" };
              urls.add(data.url);
              count++;
              return { id: `sub-${count}`, url: data.url, enabled: true, createdAt: new Date(), events: [] };
            }),
          },
        });
      });
      lock = run.then(() => {}, () => {});
      return run;
    });

    const [first, second, third] = await Promise.all([
      createSubscriptionRecord(db as never, { ...input, url: "https://a.test" }),
      createSubscriptionRecord(db as never, { ...input, url: "https://b.test" }),
      createSubscriptionRecord(db as never, { ...input, url: "https://a.test" }),
    ]);

    const successes = [first, second, third].filter((r) => r.ok);
    const failures = [first, second, third].filter((r) => !r.ok);
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(2);
  });
});
