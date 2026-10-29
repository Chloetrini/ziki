"use server";

import { revalidatePath } from "next/cache";
import { revalidateIssue } from "@/lib/revalidate-issue";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { bugInTenant, currentTenantIdFor } from "@/lib/tenant-context";
import { giveIdeaVerdict, ideaVerdictSchema } from "@/lib/agent-api/idea-verdicts";
import { IssueApiError } from "@/lib/agent-api/issues";
import { ACTION_RATE_LIMITS, consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

export type IdeaVerdictActionResult = {
  ok?: true;
  error?: string;
  /** True when this replaced the person's earlier verdict. */
  replaced?: boolean;
  ideaScore?: number;
  ideaThreshold?: number;
};

/**
 * A person gives an idea their verdict from the web app (#idea-verdicts):
 * good, bad or neutral, a summary of two sentences at most, and a full description.
 * Always one vote. A newer verdict replaces their earlier one.
 */
export async function giveIdeaVerdictAction(
  bugId: string,
  formData: FormData,
): Promise<IdeaVerdictActionResult> {
  const user = await requireUser();
  const userId = user.id;

  const limit = await consumeRateLimit(`idea-verdict:${userId}`, ACTION_RATE_LIMITS.addComment);
  if (!limit.allowed) return { error: RATE_LIMIT_MESSAGE };

  const tenantId = await currentTenantIdFor(userId);
  if (!tenantId || typeof bugId !== "string" || !bugId) return { error: "Issue not found" };

  const bug = await prisma.bug.findUnique({
    where: { id: bugId, ...bugInTenant(tenantId) },
    select: { id: true, projectId: true, isDeleted: true },
  });
  if (!bug || bug.isDeleted) return { error: "Issue not found" };

  const parsed = ideaVerdictSchema.safeParse({
    opinion: formData.get("opinion") ?? undefined,
    summary: formData.get("summary") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "opinion") return { error: "Pick good, bad or neutral." };
    return { error: issue?.message ?? "Check your verdict and try again." };
  }

  try {
    const given = await giveIdeaVerdict({ tenantId, userId }, bug.projectId, bug.id, parsed.data);
    revalidatePath("/issues");
    revalidateIssue(bug.id);
    return { ok: true, replaced: given.replaced, ideaScore: given.ideaScore, ideaThreshold: given.ideaThreshold };
  } catch (error) {
    if (error instanceof IssueApiError) return { error: error.message };
    console.error("[idea-verdict] failed", error);
    return { error: "Could not save your verdict. Please try again." };
  }
}
