import { redirect } from "next/navigation";

/** Managing agents is its own page at /agents now; keep old links and notifications working. */
export default function LegacyAgentsSettingsPage() {
  redirect("/agents");
}
