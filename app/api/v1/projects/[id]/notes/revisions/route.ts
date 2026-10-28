import type { NextRequest } from "next/server";
import { notesRequest, type NotesRouteContext } from "@/lib/agent-api/notes";
import { listNoteRevisions } from "@/lib/project-notes";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(request, context, "notes.revisions", false, (actor) => listNoteRevisions(actor, request.nextUrl.searchParams));
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = createOptions(["GET", "HEAD", "OPTIONS"]);
