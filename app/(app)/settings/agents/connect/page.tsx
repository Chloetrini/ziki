import { redirect } from "next/navigation";

/** Connecting an agent lives at /settings/connect now; a pairing code goes to its own approval page. */
export default async function LegacyConnectAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  redirect(
    typeof code === "string" && code
      ? `/settings/agents/pair?code=${encodeURIComponent(code.slice(0, 20))}`
      : "/settings/connect",
  );
}
