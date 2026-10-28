/**
 * Decides which origin the Auth.js route should treat a request as coming
 * from (#206).
 *
 * When the app knows its own URL (AUTH_URL / NEXTAUTH_URL, which production
 * always sets), that origin is used and client-supplied proxy headers are
 * ignored, so `X-Forwarded-Host: attacker.example` can't redirect the OAuth
 * callback, post-login redirect or cookies anywhere else.
 *
 * Only without a configured URL (local development) are `x-forwarded-proto`,
 * `x-forwarded-host` and `host` consulted, and then only after validation.
 */

import { cleanEnv } from "@/lib/env-clean";

const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/i;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

/** Accepts only a plain `hostname` or `hostname:port`; no paths, users or schemes. */
export function isValidHostHeader(value: string | null | undefined): value is string {
  if (!value) return false;
  const host = value.trim();
  if (!HOST_RE.test(host)) return false;
  const port = host.includes(":") ? Number(host.split(":")[1]) : null;
  return port === null || (port > 0 && port <= 65535);
}

/** Proxies may send a comma-separated list; the first entry is the client-facing one. */
function firstValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function resolveAuthOrigin({
  configuredUrl,
  requestUrl,
  forwardedProto,
  forwardedHost,
  host,
}: {
  configuredUrl?: string | null;
  requestUrl: string;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
}): string {
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      // Fall through to the request-based origin if the env value is malformed.
    }
  }

  const fallback = new URL(requestUrl);
  const candidateHost = [firstValue(forwardedHost), firstValue(host)].find(isValidHostHeader);
  const resolvedHost = candidateHost ?? fallback.host;

  const proto = firstValue(forwardedProto)?.toLowerCase();
  const hostname = resolvedHost.split(":")[0].toLowerCase();
  const scheme =
    proto === "http" || proto === "https"
      ? proto
      : LOCAL_HOSTNAMES.has(hostname)
        ? "http"
        : "https";

  const url = new URL(`${scheme}://${resolvedHost}`);
  // Drop the container's internal port when served over HTTPS behind a proxy.
  if (scheme === "https" && (url.port === "3000" || url.port === "3001")) {
    url.port = "";
  }
  return url.origin;
}

/**
 * Derives the canonical public origin for an incoming server request,
 * accounting for reverse proxies (X-Forwarded-* headers) and configured URLs (#539).
 */
export function getRequestOrigin(request: { url: string; headers: Headers }): string {
  const configured =
    cleanEnv(process.env.AUTH_URL) ||
    cleanEnv(process.env.NEXTAUTH_URL) ||
    cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) ||
    (process.env.NODE_ENV === "production" ? "https://ziki.dev" : null);

  return resolveAuthOrigin({
    configuredUrl: configured,
    requestUrl: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  });
}
