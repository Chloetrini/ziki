import { redirect } from "next/navigation";

export const metadata = { title: "Redesign proposals" };

/** The list lives on Escalations, as the Redesign type. */
export default function RedesignsPage() {
  redirect("/escalations?type=Redesign");
}
