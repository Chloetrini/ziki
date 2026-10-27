import { redirect } from "next/navigation";

/**
 * Direct shortcut for the Projects section in Settings.
 */
export default function SettingsProjectsPage() {
  redirect("/settings?section=projects");
}
