import { apiNotFound } from "@/lib/agent-api/http-errors";

/**
 * Route handler for unmatched GET requests under `/api/v1`.
 *
 * @param req - Incoming HTTP request.
 * @returns 404 HTTP Response.
 */
export function GET(req: Request): Response {
  return apiNotFound(req);
}

/**
 * Route handler for unmatched POST requests under `/api/v1`.
 *
 * @param req - Incoming HTTP request.
 * @returns 404 HTTP Response.
 */
export function POST(req: Request): Response {
  return apiNotFound(req);
}

/**
 * Route handler for unmatched PUT requests under `/api/v1`.
 *
 * @param req - Incoming HTTP request.
 * @returns 404 HTTP Response.
 */
export function PUT(req: Request): Response {
  return apiNotFound(req);
}

/**
 * Route handler for unmatched PATCH requests under `/api/v1`.
 *
 * @param req - Incoming HTTP request.
 * @returns 404 HTTP Response.
 */
export function PATCH(req: Request): Response {
  return apiNotFound(req);
}

/**
 * Route handler for unmatched DELETE requests under `/api/v1`.
 *
 * @param req - Incoming HTTP request.
 * @returns 404 HTTP Response.
 */
export function DELETE(req: Request): Response {
  return apiNotFound(req);
}

/**
 * Route handler for unmatched HEAD requests under `/api/v1`.
 *
 * @param req - Incoming HTTP request.
 * @returns 404 HTTP Response without body.
 */
export function HEAD(req: Request): Response {
  return apiNotFound(req);
}

/**
 * Route handler for unmatched OPTIONS requests under `/api/v1`.
 *
 * @param req - Incoming HTTP request.
 * @returns 404 HTTP Response.
 */
export function OPTIONS(req: Request): Response {
  return apiNotFound(req);
}
