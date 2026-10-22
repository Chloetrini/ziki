import { describe, expect, it } from "vitest";
import {
  DRAFT_TTL_MS,
  clearCommentDrafts,
  clearDraft,
  discardLegacyDraft,
  draftKey,
  isLegacyDraftKey,
  legacyDraftKey,
  readDraft,
  writeDraft,
} from "./comment-draft";

function store(initial: Record<string, string> = {}) {
  const held = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
    get length() {
      return held.size;
    },
    key: (i: number) => Array.from(held.keys())[i] ?? null,
    size: () => held.size,
    raw: (k: string) => held.get(k),
  };
}

const angry = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

describe("draftKey", () => {
  it("separates each viewer, issue, and reply (#481)", () => {
    expect(draftKey("u1", "b1")).not.toBe(draftKey("u2", "b1"));
    expect(draftKey("u1", "b1")).not.toBe(draftKey("u1", "b2"));
    expect(draftKey("u1", "b1")).not.toBe(draftKey("u1", "b1", "c9"));
    expect(draftKey("u1", "b1", "c9")).not.toBe(draftKey("u1", "b1", "c8"));
  });

  it("is stable for the same inputs", () => {
    expect(draftKey("u1", "b1", "c9")).toBe(draftKey("u1", "b1", "c9"));
  });

  it("never reuses the unscoped key older builds wrote", () => {
    expect(draftKey("u1", "b1", "c9")).not.toBe(legacyDraftKey("b1", "c9"));
    expect(isLegacyDraftKey(draftKey("u1", "b1", "c9"))).toBe(false);
    expect(isLegacyDraftKey(legacyDraftKey("b1", "c9"))).toBe(true);
  });

  it("falls back to one anonymous segment when no viewer is known", () => {
    expect(draftKey(null, "b1")).toBe(draftKey(undefined, "b1"));
    expect(draftKey("   ", "b1")).toBe(draftKey(undefined, "b1"));
    expect(draftKey(undefined, "b1")).not.toBe(draftKey("u1", "b1"));
  });
});

describe("logout cleanup and A/B isolation (#481)", () => {
  it("leaves the next account with neither the root nor the reply draft", () => {
    const s = store();
    writeDraft(s, draftKey("A", "b1"), "A's unsent comment");
    writeDraft(s, draftKey("A", "b1", "c9"), "A's unsent reply");

    // What sign-out does.
    clearCommentDrafts(s as unknown as Storage, "A");

    // What account B would read on the same browser profile.
    expect(readDraft(s, draftKey("B", "b1"))).toBe("");
    expect(readDraft(s, draftKey("B", "b1", "c9"))).toBe("");
    expect(s.size()).toBe(0);
  });

  it("keeps drafts scoped to the viewer who signed out", () => {
    const s = store();
    writeDraft(s, draftKey("A", "b1"), "A's text");
    writeDraft(s, draftKey("B", "b1"), "B's text");

    clearCommentDrafts(s as unknown as Storage, "A");

    expect(readDraft(s, draftKey("A", "b1"))).toBe("");
    expect(readDraft(s, draftKey("B", "b1"))).toBe("B's text");
  });

  it("never restores a legacy unscoped draft into a new account", () => {
    const s = store();
    writeDraft(s, legacyDraftKey("b1"), "written by whoever was here before");
    writeDraft(s, legacyDraftKey("b1", "c9"), "an old reply");

    // Only the scoped key is ever read.
    expect(readDraft(s, draftKey("B", "b1"))).toBe("");
    expect(readDraft(s, draftKey("B", "b1", "c9"))).toBe("");

    // ...and logout clears the leftovers, which belong to nobody.
    clearCommentDrafts(s as unknown as Storage, "B");
    expect(s.size()).toBe(0);
  });

  it("discards a legacy draft for one issue without touching the rest", () => {
    const s = store();
    writeDraft(s, legacyDraftKey("b1"), "old root");
    writeDraft(s, legacyDraftKey("b2"), "another issue");
    writeDraft(s, draftKey("B", "b1"), "current");

    discardLegacyDraft(s, "b1");

    expect(s.raw(legacyDraftKey("b1"))).toBeUndefined();
    expect(s.raw(legacyDraftKey("b2"))).toBeDefined();
    expect(readDraft(s, draftKey("B", "b1"))).toBe("current");
  });

  it("clears every comment draft when no viewer id is available", () => {
    const s = store();
    writeDraft(s, draftKey("A", "b1"), "A");
    writeDraft(s, draftKey("B", "b1"), "B");
    writeDraft(s, legacyDraftKey("b1"), "legacy");

    clearCommentDrafts(s as unknown as Storage);

    expect(s.size()).toBe(0);
  });
});

describe("writeDraft and readDraft", () => {
  it("round-trips what was typed", () => {
    const s = store();
    writeDraft(s, "k", "half a thought");
    expect(readDraft(s, "k")).toBe("half a thought");
  });

  it("removes the entry when the box is emptied", () => {
    const s = store();
    writeDraft(s, "k", "something");
    writeDraft(s, "k", "   ");
    expect(s.size()).toBe(0);
    expect(readDraft(s, "k")).toBe("");
  });

  it("returns nothing for a key that was never written", () => {
    expect(readDraft(store(), "k")).toBe("");
  });

  it("drops a draft older than the TTL, and keeps one inside it", () => {
    const s = store();
    const then = 1_000_000;
    writeDraft(s, "k", "old", then);
    expect(readDraft(s, "k", then + DRAFT_TTL_MS - 1)).toBe("old");
    expect(readDraft(s, "k", then + DRAFT_TTL_MS + 1)).toBe("");
    expect(s.size()).toBe(0);
  });

  it("discards junk and the wrong shape rather than returning it", () => {
    const s = store({ a: "not json", b: JSON.stringify({ nope: 1 }), c: JSON.stringify({ body: 5, savedAt: 1 }) });
    for (const key of ["a", "b", "c"]) {
      expect(readDraft(s, key), key).toBe("");
    }
    expect(s.size()).toBe(0);
  });

  it("survives storage that throws on every call", () => {
    // Private-mode Safari and blocked site data both behave this way. The
    // comment still posts; only the draft is lost.
    expect(readDraft(angry, "k")).toBe("");
    expect(() => writeDraft(angry, "k", "x")).not.toThrow();
    expect(() => clearDraft(angry, "k")).not.toThrow();
  });
});

describe("clearDraft", () => {
  it("removes only that key", () => {
    const s = store();
    writeDraft(s, "a", "one");
    writeDraft(s, "b", "two");
    clearDraft(s, "a");
    expect(readDraft(s, "a")).toBe("");
    expect(readDraft(s, "b")).toBe("two");
  });
});
