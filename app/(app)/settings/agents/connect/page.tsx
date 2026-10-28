import { redirect } from "next/navigation";

/** Connecting an agent lives at /settings/connect now; keep old links and a pairing code working. */
export default async function LegacyConnectAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  redirect(typeof code === "string" && code ? `/settings/connect?code=${encodeURIComponent(code)}` : "/settings/connect");
}
