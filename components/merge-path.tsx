import { Fragment } from "react";
import { DEPLOY_STAGES, type DeployStage } from "@/lib/deploy-stage";
import { describePath, type MergePath, type StepState } from "@/lib/merge-history";

// Palette colours only: theme-dark.css remaps them, so the chips follow the theme.

/** Merged chips take the stage's own colour, the same as the Path legend. */
export const stageChipClass: Record<DeployStage, string> = {
  dev: "bg-zk-chip text-zk-text2",
  staging: "bg-blue-50 text-blue-700",
  main: "bg-emerald-50 text-emerald-700",
};

/** Open PR, purple; for the Latest movement text and release PR badges too. */
export const openTone = "bg-violet-50 text-violet-700";
export const mergedTone = "bg-emerald-50 text-emerald-700";

const stateClass: Record<Exclude<StepState, "merged">, string> = {
  open: `merge-chip-live border-violet-200 ${openTone}`,
  not_linked: "border-amber-200 bg-amber-50 text-amber-800",
  pending: "border-dashed border-zk-border bg-zk-surface text-zk-muted",
};

const titles: Record<StepState, (stage: DeployStage) => string> = {
  merged: (s) => `Merged into ${s}`,
  open: () => "Pull request open",
  not_linked: () => "Not linked",
  pending: () => "Not reached",
};

export const chipBase =
  "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[7px] border border-transparent px-2 font-mono text-[11.5px] font-semibold";

export function Arrow() {
  return <span aria-hidden="true" className="text-[12px] text-zk-muted opacity-60">→</span>;
}

function Icon({ state }: { state: StepState }) {
  const common = { width: 11, height: 11, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (state) {
    case "merged":
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    case "open":
      return <PullRequestIcon size={11} />;
    case "not_linked":
      return <svg {...common}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
    case "pending":
      return <svg {...common} strokeWidth={2.2}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export function PullRequestIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" />
      <path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4M13 3.5 10.5 6 13 8.5" />
    </svg>
  );
}

export function MergeIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2.5" /><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="12" r="2.5" />
      <path d="M6 7.5v9M6 8a7 7 0 0 0 9.5 4" />
    </svg>
  );
}

/** dev → staging → main as three chips, one state each. */
export function MergePathChips({ path }: { path: MergePath }) {
  return (
    <div className="merge-path flex flex-wrap items-center gap-1.5" role="img" aria-label={describePath(path)}>
      {DEPLOY_STAGES.map((stage, i) => {
        const state = path.steps[stage];
        return (
          <Fragment key={stage}>
            {i > 0 ? <Arrow /> : null}
            <span
              data-stage={stage}
              data-state={state}
              title={titles[state](stage)}
              className={`${chipBase} ${state === "merged" ? stageChipClass[stage] : stateClass[state]}`}
            >
              <Icon state={state} />
              {stage}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
