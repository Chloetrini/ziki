import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Agent API keys and pairing codes (#427). A SHA-256 hash is always stored.
 * The raw key is also sealed, so the owner can copy each agent's key again
 * from Settings. It is never stored in the clear.
 */

/** Every key starts with this, so a leaked one is easy to recognise. */
export const API_KEY_PREFIX = "ziki_";
/** How much of the key is kept for display, e.g. "ziki_Ab3dE6". */
export const KEY_DISPLAY_LENGTH = API_KEY_PREFIX.length + 6;

export function hashSecret(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type NewApiKey = { raw: string; hash: string; prefix: string };

/** A fresh key: 32 random bytes, so it can't be guessed. */
export function generateApiKey(): NewApiKey {
  const raw = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashSecret(raw), prefix: raw.slice(0, KEY_DISPLAY_LENGTH) };
}

/**
 * Reads the token out of an `Authorization` header, or says why it could not.
 *
 * `missing` means there is nothing to read: no header, or a `Bearer` scheme
 * with no token. Everything else means a header *was* sent but is unusable
 * (#467) - a wrong scheme, or a token that is not shaped like a Ziki key
 * (a truncated paste, a quoted key, a token with a space in it). The two are
 * not the same problem, so callers can answer `invalid_key` instead of telling
 * an agent that did send a key to send one.
 */
export type AuthorizationToken =
  | { status: "ok"; token: string }
  | { status: "missing" }
  | { status: "malformed" };

export function authorizationToken(header: string | null | undefined): AuthorizationToken {
  const value = (header ?? "").trim();
  if (!value) return { status: "missing" };
  const parts = value.split(/\s+/);
  const [scheme, ...rest] = parts;
  // `Bearer` on its own is a scheme with no token: nothing was actually sent.
  if (parts.length === 1 && scheme.toLowerCase() === "bearer") return { status: "missing" };
  // No scheme at all (a bare or pinched value).
  if (parts.length < 2) return { status: "malformed" };
  // A scheme other than Bearer still means a header was sent.
  if (scheme.toLowerCase() !== "bearer") return { status: "malformed" };
  // A token with a space in it is malformed.
  if (rest.length > 1) return { status: "malformed" };
  const token = rest[0];
  return token.startsWith(API_KEY_PREFIX) ? { status: "ok", token } : { status: "malformed" };
}

/** Reads `Authorization: Bearer <key>`. Anything else is no key. */
export function bearerToken(header: string | null | undefined): string | null {
  const parsed = authorizationToken(header);
  return parsed.status === "ok" ? parsed.token : null;
}

// No 0/O, 1/I/L or U: the code is read off one screen and typed into another.
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const USER_CODE_LENGTH = 8;

/** The short code the owner types to approve a pairing, e.g. "KX7P-2MQD". */
export function generateUserCode(): string {
  let code = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * The form a typed code is hashed in: upper case, no spaces or dashes. Null
 * when it can't be a code at all, so a typo never reaches the database.
 */
export function normalizeUserCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== USER_CODE_LENGTH) return null;
  for (const char of code) if (!USER_CODE_ALPHABET.includes(char)) return null;
  return code;
}

/** The secret the waiting agent polls with to collect its key. */
export function generateDeviceCode(): string {
  return randomBytes(32).toString("base64url");
}
