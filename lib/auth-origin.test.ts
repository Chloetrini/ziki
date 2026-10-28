import { describe, expect, it } from "vitest";
import { isValidHostHeader, resolveAuthOrigin, getRequestOrigin } from "./auth-origin";

describe("resolveAuthOrigin with a configured URL (production)", () => {
  const configuredUrl = "https://ziki.dev/api/auth";

  it("ignores spoofed forwarded headers", () => {
    expect(
      resolveAuthOrigin({
        configuredUrl,
        requestUrl: "http://0.0.0.0:3000/api/auth/signin/google",
        forwardedHost: "attacker.example",
        forwardedProto: "http",
        host: "attacker.example",
      }),
    ).toBe("https://ziki.dev");
  });

  it("still resolves the old issues.zedu.chat host when it is configured (#424)", () => {
    expect(
      resolveAuthOrigin({
        configuredUrl: "https://issues.zedu.chat/api/auth",
        requestUrl: "http://0.0.0.0:3000/api/auth/signin/google",
        host: "attacker.example",
      }),
    ).toBe("https://issues.zedu.chat");
  });

  it("falls back to the request when the configured URL is malformed", () => {
    expect(
      resolveAuthOrigin({ configuredUrl: "not a url", requestUrl: "http://localhost:3001/x" }),
    ).toBe("http://localhost:3001");
  });
});

describe("resolveAuthOrigin without a configured URL (local dev)", () => {
  it("uses a valid forwarded host and proto", () => {
    expect(
      resolveAuthOrigin({
        requestUrl: "http://0.0.0.0:3000/api/auth",
        forwardedHost: "dev.zedu.test",
        forwardedProto: "https",
      }),
    ).toBe("https://dev.zedu.test");
  });

  it("rejects hosts carrying paths, credentials or schemes", () => {
    for (const forwardedHost of [
      "attacker.example/evil",
      "user@attacker.example",
      "https://attacker.example",
      "attacker.example:99999",
      "a b",
    ]) {
      expect(
        resolveAuthOrigin({ requestUrl: "http://localhost:3001/api/auth", forwardedHost }),
      ).toBe("http://localhost:3001");
    }
  });

  it("only accepts http or https as the protocol", () => {
    expect(
      resolveAuthOrigin({
        requestUrl: "http://localhost:3001/api/auth",
        forwardedHost: "dev.zedu.test",
        forwardedProto: "javascript",
      }),
    ).toBe("https://dev.zedu.test");
  });

  it("uses the first value of a comma-separated proxy header", () => {
    expect(
      resolveAuthOrigin({
        requestUrl: "http://localhost:3001/api/auth",
        forwardedHost: "dev.zedu.test, attacker.example",
        forwardedProto: "https, http",
      }),
    ).toBe("https://dev.zedu.test");
  });

  it("defaults localhost to http and drops the container port over https", () => {
    expect(resolveAuthOrigin({ requestUrl: "http://localhost:3001/api/auth", host: "localhost:3001" })).toBe(
      "http://localhost:3001",
    );
    expect(
      resolveAuthOrigin({ requestUrl: "http://x/api", host: "app.zedu.test:3000", forwardedProto: "https" }),
    ).toBe("https://app.zedu.test");
  });
});

describe("isValidHostHeader", () => {
  it("accepts host and host:port only", () => {
    expect(isValidHostHeader("ziki.dev")).toBe(true);
    // The old host keeps passing so existing links don't break (#424).
    expect(isValidHostHeader("issues.zedu.chat")).toBe(true);
    expect(isValidHostHeader("localhost:3001")).toBe(true);
    expect(isValidHostHeader("evil.com/x")).toBe(false);
    expect(isValidHostHeader("")).toBe(false);
    expect(isValidHostHeader(null)).toBe(false);
  });
});

describe("getRequestOrigin", () => {
  it("resolves from forwarded headers behind a reverse proxy", () => {
    const headers = new Headers({
      "x-forwarded-host": "ziki.dev",
      "x-forwarded-proto": "https",
      host: "0.0.0.0:3000",
    });
    expect(getRequestOrigin({ url: "http://0.0.0.0:3000/projects/github/callback", headers })).toBe(
      "https://ziki.dev",
    );
  });

  it("resolves from request url in local dev when no proxy headers exist", () => {
    const headers = new Headers({
      host: "localhost:3001",
    });
    expect(getRequestOrigin({ url: "http://localhost:3001/projects/github/callback", headers })).toBe(
      "http://localhost:3001",
    );
  });
});
