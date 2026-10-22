const API_NOT_FOUND = {
  error: "not_found",
  message: "No such API route. See /llms.txt.",
};

const METHOD_NOT_ALLOWED = {
  error: "method_not_allowed",
  message: "Method not allowed.",
};

/**
 * Returns a standard JSON 404 response for unknown agent API routes.
 * For HEAD requests, returns a bodyless 404 response with a JSON Content-Type header.
 *
 * @param request - Optional incoming HTTP request to inspect the HTTP method.
 * @returns 404 HTTP Response with JSON error payload or null body for HEAD.
 */
export function apiNotFound(request?: Request): Response {
  if (request?.method === "HEAD") {
    return new Response(null, {
      status: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
  return Response.json(API_NOT_FOUND, { status: 404 });
}

/**
 * Creates a route handler that returns a JSON 405 Method Not Allowed response.
 *
 * @param allowedMethods - The HTTP methods permitted for the route.
 * @returns A route handler function returning a 405 HTTP Response.
 */
export function createMethodNotAllowed(allowedMethods: readonly string[]) {
  const allow = allowedMethods.join(", ");

  return (request: Request): Response =>
    new Response(
      request.method === "HEAD" ? null : JSON.stringify(METHOD_NOT_ALLOWED),
      {
        status: 405,
        headers: {
          Allow: allow,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
}

/**
 * Creates an OPTIONS route handler returning a 204 No Content response with Allow header.
 *
 * @param allowedMethods - The HTTP methods permitted for the route.
 * @returns A route handler function returning a 204 HTTP Response.
 */
export function createOptions(allowedMethods: readonly string[]) {
  const allow = allowedMethods.join(", ");

  return (): Response => new Response(null, { status: 204, headers: { Allow: allow } });
}
