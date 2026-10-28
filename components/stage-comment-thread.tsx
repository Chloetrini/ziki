"use client";

import type { ComponentProps } from "react";
import { CommentThread } from "@/components/comment-thread";
import { useIssueStage } from "@/components/issue-stage-context";
import type { DecisionStage } from "@/lib/decision-stages";

/** The conversation, filtered to the stage picked in the progress report (#1446). */
export function StageCommentThread(props: ComponentProps<typeof CommentThread>) {
  const picked = useIssueStage();
  return <CommentThread {...props} stage={picked?.stage ?? props.stage ?? null} />;
}

/** The Conversation heading's count: comments at the picked stage. */
export function StageConversationCount({
  counts,
  fallback,
}: {
  counts: Record<DecisionStage, number>;
  /** Shown outside a stage provider. */
  fallback: number;
}) {
  const picked = useIssueStage();
  return <>{picked ? counts[picked.stage] : fallback}</>;
}
