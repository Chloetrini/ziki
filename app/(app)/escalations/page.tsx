import { redirect } from "next/navigation";

export const metadata = { title: "Agent Escalations" };

/**
 * Unify Agent Escalations into the Issues Inbox.
 *
 * Mark Essien: "Need your input in the Inbox should automatically mean the
 * escalation, rather than having a separate escalation page somewhere else."
 *
 * Incoming requests to /escalations redirect directly to the unified Inbox
 * queue under "Need your input" (or "Design feedback needed" for redesigns),
 * preserving any deep-link or filter parameters.
 */
export default async function EscalationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; type?: string; id?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();

  if (params.type === "Redesign") {
    query.set("inbox", "design");
  } else {
    query.set("inbox", "input");
  }

  if (params.id) {
    query.set("escalation", params.id);
  }

  const queryString = query.toString();
  redirect(`/issues${queryString ? `?${queryString}` : ""}`);
}
