import type { Severity, Status } from "@prisma/client";
import type { IssueStage } from "@/lib/issue-stage";

/** Shared card shell for the issue detail redesign. */
export const issueCardClass =
  "rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-6";

export const issueRailCardClass =
  "rounded-[20px] border border-zk-border bg-zk-surface p-5";

export const issueSectionLabelClass =
  "text-xs font-bold uppercase tracking-[0.08em] text-zk-muted";

export const issueAccentLinkClass =
  "font-semibold text-zk-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong focus-visible:ring-offset-2";

/** Status language from the redesign handoff (overrides shared label classes). */
export const issueStatusChipClass: Record<Status, string> = {
  open: "bg-zk-info-bg text-zk-info-fg",
  in_progress: "bg-zk-info-bg text-zk-info-fg",
  resolved: "bg-zk-ok-bg text-zk-ok-fg",
  closed: "bg-zk-chip text-zk-text2",
};

export const issueSeverityChipClass: Record<Severity, string> = {
  low: "bg-zk-chip text-zk-text2",
  medium: "border border-zk-warn-bd bg-zk-warn-bg text-zk-warn-fg",
  high: "bg-zk-bad-bg text-zk-bad-fg",
  critical: "border border-zk-bad-bd bg-zk-bad-bg text-zk-bad-fg",
};

export const issueStageChipClass: Record<IssueStage, string> = {
  reported: "bg-zk-chip text-zk-text2",
  confirmed: "bg-zk-ok-bg text-zk-ok-fg",
  ready: "bg-zk-info-bg text-zk-info-fg",
};

export const reviewStatusLabels: Record<string, string> = {
  submitted: "In Review",
  ready_to_merge: "Ready to Merge",
  rejected: "Needs Revision",
  merged: "Merged",
};

export const reviewStatusChipClass: Record<string, string> = {
  submitted: "border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  ready_to_merge: "border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  rejected: "border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  merged: "border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
};

export const issueChipBaseClass =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold";
