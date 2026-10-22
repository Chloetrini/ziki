import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = join(process.cwd(), "app", "api", "v1");
const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path] : [];
  });
}

function methodsIn(file: string) {
  const source = readFileSync(file, "utf8");
  const stubbed = new Set(
    [...source.matchAll(/export const (\w+) = apiMethodNotAllowed\b/g)].map((match) => match[1]),
  );
  const handled = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    if (VERBS.includes(match[1])) handled.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+const\s+(\w+)\s*=/g)) {
    if (VERBS.includes(match[1]) && !stubbed.has(match[1])) handled.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const entry of match[1].split(",")) {
      const name = entry.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && VERBS.includes(name)) handled.add(name);
    }
  }
  const allowed = [...source.matchAll(/create(?:MethodNotAllowed|Options)\(\[([^\]]*)\]\)/g)].map(
    (match) => [...match[1].matchAll(/"([^"]+)"/g)].map((quoted) => quoted[1]).filter((verb) => VERBS.includes(verb)),
  );
  return { source, handled, stubbed, allowed };
}

/**
 * Every `/api/v1` route advertises its own verbs. A route that gains or loses a
 * handler must update its `Allow` list, or the JSON 405 points clients at a verb
 * that does not exist (and hides one that does) — #471.
 */
describe("agent API routes advertise their real methods (#471)", () => {
  const files = routeFiles(API_ROOT).filter((file) => !relative(API_ROOT, file).includes("[...path]"));

  it("covers every route file", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((file) => [relative(process.cwd(), file), file]))(
    "%s keeps Allow, handlers and 405 stubs in agreement",
    (_name, file) => {
      const { source, handled, stubbed, allowed } = methodsIn(file as string);

      expect(source, "route should return a JSON 405 for unsupported verbs").toContain("apiMethodNotAllowed");
      expect(allowed.length, "route should declare its Allow list once").toBeGreaterThan(0);

      if (allowed.length > 1) {
        const [first, ...rest] = allowed.map((verbs) => [...new Set(verbs)].sort().join(","));
        for (const other of rest) expect(other).toBe(first);
      }

      const advertised = new Set(allowed[0]);
      for (const verb of handled) expect(advertised, `${verb} is handled but not advertised`).toContain(verb);
      for (const verb of advertised) expect(stubbed, `${verb} is advertised but answered with 405`).not.toContain(verb);

      for (const verb of VERBS) {
        if (verb === "OPTIONS" || verb === "HEAD" || handled.has(verb)) continue;
        expect(stubbed, `${verb} is unsupported but returns a bare 405`).toContain(verb);
      }
    },
  );
});
