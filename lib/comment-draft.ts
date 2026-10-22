/**
 * Unsent comment text, kept per issue (and per reply) so navigating away,
 * reloading or closing the tab does not throw away what someone had typed.
 *
 * Storage is per-browser and per-viewer: nothing here reaches the server or
 * another device, and every access is wrapped because private-mode and
 * blocked-site-data both make these throw rather than return nothing.
 */

const PREFIX = "comment-draft";

/**
 * Used when no viewer is known. The composer is read-only for signed-out
 * people, so this only keeps the key shape total for tests and races where a
 * session disappears mid-render.
 */
const ANON = "anon";

/** Drafts older than this are dropped on read rather than kept forever. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredDraft = { body: string; savedAt: number };

/**
 * A draft belongs to one viewer as well as one issue/reply (#481): two
 * accounts sharing a browser profile must never see each other's unsent text.
 */
export function draftKey(
  viewerId: string | null | undefined,
  bugId: string,
  parentId?: string,
): string {
  return `${PREFIX}:${viewerId?.trim() || ANON}:${bugId}:${parentId ?? "root"}`;
}

/**
 * The pre-#481 key shape, which had no viewer segment. It is only kept so
 * logout can drop drafts that can no longer be attributed to anyone; nothing
 * ever reads it.
 */
export function legacyDraftKey(bugId: string, parentId?: string): string {
  return `${PREFIX}:${bugId}:${parentId ?? "root"}`;
}

/** True for the old unscoped shape: `comment-draft:<bugId>:<parent>`. */
export function isLegacyDraftKey(key: string): boolean {
  if (!key.startsWith(`${PREFIX}:`)) return false;
  return key.slice(PREFIX.length + 1).split(":").length === 2;
}

/**
 * Drops the unscoped draft an older build may have left for this issue/reply.
 * It cannot be attributed to a viewer, so importing it into whoever signs in
 * next is exactly the leak #481 reports.
 */
export function discardLegacyDraft(
  store: Pick<Storage, "removeItem">,
  bugId: string,
  parentId?: string,
): void {
  try {
    store.removeItem(legacyDraftKey(bugId, parentId));
  } catch {
    // Storage blocked; nothing to discard.
  }
}

/**
 * Removes one viewer's comment drafts, plus any unscoped leftovers from older
 * builds. Called on logout so a shared profile does not carry text forward.
 */
export function clearCommentDrafts(
  store: Storage,
  viewerId?: string | null,
): void {
  if (typeof store?.key !== "function" || typeof store.length !== "number") {
    return;
  }
  const owned = `${PREFIX}:${viewerId?.trim() || ANON}:`;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      // With no viewer id we fall back to every comment draft for this browser.
      if (viewerId ? key.startsWith(owned) : key.startsWith(`${PREFIX}:`)) {
        doomed.push(key);
      } else if (isLegacyDraftKey(key)) {
        doomed.push(key);
      }
    }
  } catch {
    return;
  }
  for (const key of doomed) clearDraft(store, key);
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The saved draft, or "" when there is none, it is stale, or it is unreadable. */
export function readDraft(store: Store, key: string, now = Date.now()): string {
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return "";
  }
  if (!raw) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Someone else's key, or a half-written value.
    clearDraft(store, key);
    return "";
  }

  const draft = parsed as Partial<StoredDraft>;
  if (typeof draft?.body !== "string" || typeof draft?.savedAt !== "number") {
    clearDraft(store, key);
    return "";
  }
  if (now - draft.savedAt > DRAFT_TTL_MS) {
    clearDraft(store, key);
    return "";
  }
  return draft.body;
}

/** Saves a draft, or removes it when the field has been emptied. */
export function writeDraft(
  store: Store,
  key: string,
  body: string,
  now = Date.now(),
): void {
  if (!body.trim()) {
    clearDraft(store, key);
    return;
  }
  try {
    store.setItem(key, JSON.stringify({ body, savedAt: now } satisfies StoredDraft));
  } catch {
    // Storage full or unavailable. The comment still posts; only the draft
    // is lost, which is no worse than before drafts existed.
  }
}

export function clearDraft(store: Store, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // As above.
  }
}
