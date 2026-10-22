import { describe, expect, it } from "vitest";
import { apiNotFound, createMethodNotAllowed, createOptions } from "./http-errors";

describe("agent API HTTP errors", () => {
  it("returns a JSON 404 for unknown API routes", async () => {
    const response = apiNotFound();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "not_found",
      message: "No such API route. See /llms.txt.",
    });
  });

  it("keeps HEAD responses bodyless while reporting a 404", () => {
    const response = apiNotFound(new Request("https://ziki.dev/api/v1/unknown", { method: "HEAD" }));

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.body).toBeNull();
  });

  it("returns a JSON 405 and the route's allowed methods", async () => {
    const handler = createMethodNotAllowed(["GET", "HEAD", "OPTIONS"]);
    const response = handler(new Request("https://ziki.dev/api/v1/issues", { method: "PATCH" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "method_not_allowed",
      message: "Method not allowed.",
    });
  });

  it("keeps HEAD responses bodyless while reporting a 405", async () => {
    const handler = createMethodNotAllowed(["POST", "OPTIONS"]);
    const response = handler(new Request("https://ziki.dev/api/v1/issues", { method: "HEAD" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    expect(response.body).toBeNull();
  });

  it("returns the route's actual methods for OPTIONS", () => {
    const handler = createOptions(["GET", "HEAD", "OPTIONS"]);
    const response = handler();

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(response.body).toBeNull();
  });
});
