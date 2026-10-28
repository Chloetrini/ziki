import type { NextRequest } from "next/server";
import { notesRequest, type NotesRouteContext } from "@/lib/agent-api/notes";
import { readProjectNotes, requireNotesEditor, saveProjectNotes } from "@/lib/project-notes";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { issueJson } from "@/lib/agent-api/issues";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(request, context, "notes.read", false, (actor) => readProjectNotes(actor));
}
export async function PUT(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(request, context, "notes.save", true, async (actor) => {
    requireNotesEditor(actor);
    return saveProjectNotes(actor, await issueJson(request));
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "PUT", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = createOptions(["GET", "PUT", "HEAD", "OPTIONS"]);
