import { clearCommentDrafts } from "./comment-draft";

export const DRAFT_PREFIX = "draft";
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export interface StoredDraft<T> {
  values: T;
  updatedAt: number;
}

export function buildDraftKey(params: {
  userId?: string | null;
  formType: "create-bug" | "update-bug" | "comment";
  bugId?: string | null;
  parentId?: string | null;
  projectId?: string | null;
}): string {
  const userSegment = params.userId ? params.userId : "anon";

  switch (params.formType) {
    case "create-bug":
      // Scoped to the active project so a draft never follows the person
      // into a different project's form (#729); unscoped when the context
      // is unknown, matching the historical key.
      return params.projectId
        ? `${DRAFT_PREFIX}:${userSegment}:bug:new:${params.projectId}`
        : `${DRAFT_PREFIX}:${userSegment}:bug:new`;
    case "update-bug":
      return `${DRAFT_PREFIX}:${userSegment}:bug:${params.bugId ?? "unknown"}:update`;
    case "comment":
      return `${DRAFT_PREFIX}:${userSegment}:comment:${params.bugId ?? "unknown"}:${params.parentId ?? "root"}`;
  }
}

export function isDraftExpired(
  updatedAt: number,
  now: number = Date.now(),
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): boolean {
  if (typeof updatedAt !== "number" || isNaN(updatedAt)) return true;
  return now - updatedAt > maxAgeMs;
}

export function serializeDraft<T>(values: T, updatedAt: number = Date.now()): string {
  const payload: StoredDraft<T> = { values, updatedAt };
  return JSON.stringify(payload);
}

export function deserializeDraft<T>(
  raw: string | null,
  now: number = Date.now(),
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.updatedAt !== "number") return null;
    if (isDraftExpired(parsed.updatedAt, now, maxAgeMs)) return null;
    return parsed.values ?? null;
  } catch {
    return null;
  }
}

export function loadDraftFromStorage<T>(
  key: string,
  now: number = Date.now(),
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): T | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const values = deserializeDraft<T>(raw, now, maxAgeMs);
    if (!values) {
      window.localStorage.removeItem(key);
      return null;
    }
    return values;
  } catch {
    return null;
  }
}

export function saveDraftToStorage<T>(
  key: string,
  values: T,
  now: number = Date.now(),
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const serialized = serializeDraft(values, now);
    window.localStorage.setItem(key, serialized);
  } catch {
    // Gracefully handle storage quota exceeded or private mode
  }
}

export function removeDraftFromStorage(key: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore error
  }
}

export function clearUserDrafts(userId?: string | null): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const prefix = userId ? `${DRAFT_PREFIX}:${userId}:` : `${DRAFT_PREFIX}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore error
  }

  // Comment drafts use their own prefix, so the loop above never saw them
  // (#481). They are scoped per viewer as well; the unscoped leftovers from
  // older builds go too, since they belong to nobody in particular.
  clearCommentDrafts(window.localStorage, userId);
}
