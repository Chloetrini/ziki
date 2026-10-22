import { revalidatePath } from "next/cache";

/**
 * Refreshes an issue's pages after a change. Pages are served at the readable
 * number (`/issues/123`, #457) while actions know the internal id, so the
 * route pattern is revalidated too; the literal id path still covers old links.
 */
export function revalidateIssue(bugId: string): void {
  revalidatePath(`/issues/${bugId}`);
  revalidatePath("/issues/[id]", "layout");
}
