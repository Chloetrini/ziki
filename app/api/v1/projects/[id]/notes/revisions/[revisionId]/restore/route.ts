import type { NextRequest } from "next/server";
import { notesRequest, type NotesRouteContext } from "@/lib/agent-api/notes";
import { requireNotesEditor, restoreProjectNotes } from "@/lib/project-notes";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { issueJson } from "@/lib/agent-api/issues";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(request, context, "notes.restore", true, async (actor, params) => {
    requireNotesEditor(actor);
    return restoreProjectNotes(actor, params.revisionId!, await issueJson(request));
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = createOptions(["POST", "OPTIONS"]);
