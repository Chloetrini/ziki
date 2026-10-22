import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  buildDraftKey,
  isDraftExpired,
  serializeDraft,
  deserializeDraft,
  loadDraftFromStorage,
  saveDraftToStorage,
  removeDraftFromStorage,
  clearUserDrafts,
  DRAFT_MAX_AGE_MS,
} from "./form-drafts";

describe("form-drafts pure helpers (#106)", () => {
  describe("buildDraftKey", () => {
    it("builds correct key for create-bug with authenticated user", () => {
      const key = buildDraftKey({
        userId: "user-123",
        formType: "create-bug",
      });
      expect(key).toBe("draft:user-123:bug:new");
    });

    it("builds correct key for create-bug with unauthenticated user", () => {
      const key = buildDraftKey({
        formType: "create-bug",
      });
      expect(key).toBe("draft:anon:bug:new");
    });

    it("scopes create-bug drafts to the active project (#729)", () => {
      const projectA = buildDraftKey({
        userId: "user-123",
        formType: "create-bug",
        projectId: "project-a",
      });
      const projectB = buildDraftKey({
        userId: "user-123",
        formType: "create-bug",
        projectId: "project-b",
      });
      expect(projectA).toBe("draft:user-123:bug:new:project-a");
      expect(projectB).toBe("draft:user-123:bug:new:project-b");
      expect(projectA).not.toBe(projectB);
    });

    it("falls back to the legacy unscoped create-bug key without project context", () => {
      expect(buildDraftKey({ userId: "user-123", formType: "create-bug" })).toBe(
        "draft:user-123:bug:new",
      );
    });

    it("builds correct key for update-bug", () => {
      const key = buildDraftKey({
        userId: "user-456",
        formType: "update-bug",
        bugId: "bug-789",
      });
      expect(key).toBe("draft:user-456:bug:bug-789:update");
    });

    it("builds correct key for root comment", () => {
      const key = buildDraftKey({
        userId: "user-1",
        formType: "comment",
        bugId: "bug-2",
      });
      expect(key).toBe("draft:user-1:comment:bug-2:root");
    });

    it("builds correct key for reply comment", () => {
      const key = buildDraftKey({
        userId: "user-1",
        formType: "comment",
        bugId: "bug-2",
        parentId: "comment-99",
      });
      expect(key).toBe("draft:user-1:comment:bug-2:comment-99");
    });
  });

  describe("isDraftExpired", () => {
    it("returns false if draft is fresh", () => {
      const now = 10000000;
      const updatedAt = now - 1000; // 1 second ago
      expect(isDraftExpired(updatedAt, now)).toBe(false);
    });

    it("returns false if draft is just under 7 days old", () => {
      const now = 1000000000;
      const updatedAt = now - (DRAFT_MAX_AGE_MS - 1000);
      expect(isDraftExpired(updatedAt, now)).toBe(false);
    });

    it("returns true if draft is older than 7 days", () => {
      const now = 1000000000;
      const updatedAt = now - (DRAFT_MAX_AGE_MS + 1000);
      expect(isDraftExpired(updatedAt, now)).toBe(true);
    });

    it("returns true if timestamp is NaN or invalid", () => {
      expect(isDraftExpired(NaN)).toBe(true);
      expect(isDraftExpired("not a number" as unknown as number)).toBe(true);
    });
  });

  describe("serializeDraft and deserializeDraft", () => {
    it("serializes and deserializes valid values round-trip", () => {
      const now = 5000000;
      const data = { title: "App crash on login", description: "Details..." };
      const serialized = serializeDraft(data, now);
      const deserialized = deserializeDraft<typeof data>(serialized, now + 1000);
      expect(deserialized).toEqual(data);
    });

    it("returns null if draft has expired", () => {
      const now = 5000000;
      const data = { title: "Old draft" };
      const serialized = serializeDraft(data, now);
      // Check 8 days later
      const deserialized = deserializeDraft(serialized, now + DRAFT_MAX_AGE_MS + 1000);
      expect(deserialized).toBeNull();
    });

    it("returns null for malformed or corrupted JSON", () => {
      expect(deserializeDraft("{corrupted-json")).toBeNull();
      expect(deserializeDraft(null)).toBeNull();
      expect(deserializeDraft("")).toBeNull();
      expect(deserializeDraft("12345")).toBeNull();
    });
  });

  describe("localStorage operations", () => {
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      const storageMock = {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        get length() {
          return Object.keys(mockStorage).length;
        },
        key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
      };

      vi.stubGlobal("window", {
        localStorage: storageMock,
      });
    });

    it("saves and loads draft from storage", () => {
      const key = "draft:u1:bug:new";
      const values = { title: "Draft title" };

      saveDraftToStorage(key, values, 1000);
      const loaded = loadDraftFromStorage<{ title: string }>(key, 2000);

      expect(loaded).toEqual(values);
    });

    it("never loads another project's create-form draft (#729)", () => {
      const keyA = buildDraftKey({ userId: "u1", formType: "create-bug", projectId: "project-a" });
      const keyB = buildDraftKey({ userId: "u1", formType: "create-bug", projectId: "project-b" });
      saveDraftToStorage(keyA, { title: "Draft in project A" }, 1000);

      expect(loadDraftFromStorage<{ title: string }>(keyB, 2000)).toBeNull();
    });

    it("removes expired draft when loaded from storage", () => {
      const key = "draft:u1:bug:new";
      const values = { title: "Expired draft" };

      saveDraftToStorage(key, values, 1000);
      const loaded = loadDraftFromStorage(key, 1000 + DRAFT_MAX_AGE_MS + 5000);

      expect(loaded).toBeNull();
      expect(mockStorage[key]).toBeUndefined();
    });

    it("removes draft from storage explicitly", () => {
      const key = "draft:u1:bug:new";
      saveDraftToStorage(key, { a: 1 }, 1000);
      removeDraftFromStorage(key);
      expect(mockStorage[key]).toBeUndefined();
    });

    it("clears all drafts for a specific user on sign out", () => {
      mockStorage["draft:user-1:bug:new"] = JSON.stringify({ values: {}, updatedAt: 1000 });
      mockStorage["draft:user-1:comment:b1:root"] = JSON.stringify({ values: {}, updatedAt: 1000 });
      mockStorage["draft:user-2:bug:new"] = JSON.stringify({ values: {}, updatedAt: 1000 });
      // Comment drafts live under their own prefix and were missed before #481.
      mockStorage["comment-draft:user-1:b1:root"] = JSON.stringify({ body: "A root", savedAt: 1000 });
      mockStorage["comment-draft:user-1:b1:c9"] = JSON.stringify({ body: "A reply", savedAt: 1000 });
      mockStorage["comment-draft:user-2:b1:root"] = JSON.stringify({ body: "B root", savedAt: 1000 });
      mockStorage["comment-draft:b1:root"] = JSON.stringify({ body: "legacy", savedAt: 1000 });
      mockStorage["unrelated_key"] = "test";

      clearUserDrafts("user-1");

      expect(mockStorage["draft:user-1:bug:new"]).toBeUndefined();
      expect(mockStorage["draft:user-1:comment:b1:root"]).toBeUndefined();
      expect(mockStorage["draft:user-2:bug:new"]).toBeDefined();
      expect(mockStorage["comment-draft:user-1:b1:root"]).toBeUndefined();
      expect(mockStorage["comment-draft:user-1:b1:c9"]).toBeUndefined();
      expect(mockStorage["comment-draft:user-2:b1:root"]).toBeDefined();
      expect(mockStorage["comment-draft:b1:root"]).toBeUndefined();
      expect(mockStorage["unrelated_key"]).toBeDefined();
    });
  });
});
