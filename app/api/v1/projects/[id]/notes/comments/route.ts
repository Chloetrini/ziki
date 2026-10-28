import type { NextRequest } from "next/server";
import { notesRequest, type NotesRouteContext } from "@/lib/agent-api/notes";
import { listNoteComments, addNoteComment } from "@/lib/project-notes";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { issueJson } from "@/lib/agent-api/issues";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(request, context, "notes.comments", false, (actor) => listNoteComments(actor, request.nextUrl.searchParams));
}
export async function POST(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(request, context, "notes.comment", true, async (actor) => addNoteComment(actor, await issueJson(request)), 201);
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "POST", "HEAD", "OPTIONS"]);
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = createOptions(["GET", "POST", "HEAD", "OPTIONS"]);
