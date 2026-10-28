"use client";

import type { CSSProperties, ReactNode } from "react";
import { severityLabel } from "@/lib/labels";
import { LocalTime } from "@/components/local-time";
import { ClaimDeadline } from "@/components/claim-deadline";
import { timeOf, type AgentDecision } from "@/components/issue-agent-activity";
import { useIssueStage } from "@/components/issue-stage-context";
import {
  DECISION_STAGES,
  decisionStageInfo,
  stageOfDecision,
  tallyStages,
  type DecisionStage,
} from "@/lib/decision-stages";

/** The design's icon set (#1446), as inline stroke paths. */
const ICONS = {
  bulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
    </>
  ),
  bot: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="3" />
      <path d="M12 8V4M9 13v2M15 13v2" />
    </>
  ),
  flask: <path d="M9 3h6M10 3v6L4.5 19A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10" />,
  merge: (
    <>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </>
  ),
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Z" />
      <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  undo: (
    <>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  alert: <path d="m10.3 3.9-8.2 14A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-3.1l-8.2-14a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01" />,
  plus: <path d="M12 5v14M5 12h14" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M10 2h4" />
    </>
  ),
} as const;

type IconName = keyof typeof ICONS;

export function StageIcon({ name, style }: { name: IconName; style?: CSSProperties }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {ICONS[name]}
    </svg>
  );
}

export const stageIconName: Record<DecisionStage, IconName> = {
  idea: "bulb",
  open: "bot",
  done: "flask",
  ready: "merge",
  live: "rocket",
};

/** A chip class from the design: cg ok, cr bad, ca warn, cb info, cn neutral, cv violet. */
type Tone = "cg" | "cr" | "ca" | "cb" | "cn" | "cv";

type DecisionCard = { label: string; tone: Tone; icon: IconName; text: ReactNode; notes: string | null };

function onBehalf(name: string) {
  return name ? ` on behalf of ${name}` : "";
}

/** How the design draws each decision: its chip, avatar icon and sentence. */
export function decisionCard(decision: AgentDecision): DecisionCard {
  switch (decision.kind) {
    case "confirmed":
      return {
        label: "Confirmed",
        tone: "cg",
        icon: "check",
        text: (
          <>
            Confirmed this issue as real
            {decision.severity ? ` and set the severity to ${severityLabel[decision.severity]}` : ""}
            {onBehalf(decision.personName)}.
          </>
        ),
        notes: null,
      };
    case "rejected":
      return {
        label: "Rejected",
        tone: "cr",
        icon: "x",
        text: <>Found this isn&apos;t a real issue{onBehalf(decision.personName)}.</>,
        notes: decision.notes,
      };
    case "claimed":
      return {
        label: "Claimed",
        tone: "cb",
        icon: "plus",
        text: (
          <>
            Claimed this issue for {decision.personName}.
            {decision.waitingOnName ? (
              <> Waiting for {decision.waitingOnName} to answer {decision.agentName}&apos;s question.</>
            ) : decision.deliverBy ? (
              <>
                {" "}
                <ClaimDeadline deliverBy={decision.deliverBy} />
                {decision.extendedAt ? " (extension used)" : ""}.
              </>
            ) : null}
          </>
        ),
        notes: null,
      };
    case "claim_released":
      return {
        label: "Claim rejected",
        tone: "cr",
        icon: "x",
        text: <>The claim for {decision.personName} was released.</>,
        notes: null,
      };
    case "verdict":
      return decision.goodToMerge
        ? { label: "Good to merge", tone: "cg", icon: "merge", text: "Said this fix is good to merge.", notes: null }
        : { label: "Not good to merge", tone: "ca", icon: "alert", text: "Said this fix is not good to merge.", notes: null };
    case "accepted":
      return decision.merged
        ? { label: "Deployed", tone: "cg", icon: "rocket", text: "Merged and deployed the fix.", notes: null }
        : { label: "Ready to merge", tone: "cv", icon: "merge", text: "Accepted the fix: it is ready to merge.", notes: null };
    case "merge_rejected":
      return {
        label: "Not good to merge",
        tone: "ca",
        icon: "alert",
        text: "Asked for changes before it can merge.",
        notes: decision.notes,
      };
    case "deploy_failed":
      return {
        label: "Deployment failed",
        tone: "cr",
        icon: "alert",
        text: decision.reason ? `Deployment failed: ${decision.reason}` : "Deployment failed.",
        notes: null,
      };
  }
}

type StepState = "done" | "now" | "warn" | "todo";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The progress header's status chip, as in the design: "Done · testing". */
function statusChip(stage: DecisionStage, setback: boolean): { label: string; tone: Tone } {
  const label = decisionStageInfo[stage].label;
  if (setback) return { label: `${label} · not good to merge`, tone: "ca" };
  switch (stage) {
    case "idea":
      return { label: `${label} · in review`, tone: "cn" };
    case "open":
      return { label: `${label} · in progress`, tone: "cb" };
    case "done":
      return { label: `${label} · testing`, tone: "cv" };
    case "ready":
      return { label, tone: "cv" };
    case "live":
      return { label, tone: "cg" };
  }
}

function pullRequestNumber(url: string | null | undefined): string | null {
  const match = url?.match(/\/pull\/(\d+)/);
  return match ? `#${match[1]}` : null;
}

/**
 * The design's progress report and Agent decisions cards (#1446). The stepper
 * opens on the issue's current stage; picking a stage shows its decisions here
 * and filters the Conversation card.
 */
export function IssueProgressReport({
  decisions,
  currentStage,
  setback = false,
  commentCounts,
  pullRequestUrl = null,
}: {
  decisions: ReadonlyArray<AgentDecision>;
  /** Where the issue is now; marked "now" in the stepper. */
  currentStage: DecisionStage;
  /** The current stage went backwards, e.g. a merger asked for changes. */
  setback?: boolean;
  /** Top-level comments in each stage. */
  commentCounts: Record<DecisionStage, number>;
  /** The linked pull request, for the Done stage's "before a merge decision" steps. */
  pullRequestUrl?: string | null;
}) {
  const picked = useIssueStage();
  const selected = picked?.stage ?? currentStage;
  const currentIndex = DECISION_STAGES.indexOf(currentStage);
  const selectedIndex = DECISION_STAGES.indexOf(selected);
  const tallies = tallyStages(decisions);
  const inStage = decisions
    .filter((decision) => stageOfDecision(decision) === selected)
    .sort((a, b) => timeOf(a) - timeOf(b) || a.id.localeCompare(b.id));
  const info = decisionStageInfo[selected];
  const chip = statusChip(currentStage, setback);

  const stateOf = (index: number): StepState =>
    index < currentIndex ? "done" : index > currentIndex ? "todo" : setback ? "warn" : "now";

  // Done with a pull request in but no verdict yet: show what comes before a merge decision.
  const awaitingTests = selected === "done" && !!pullRequestUrl && inStage.length === 0 && selectedIndex <= currentIndex;
  const prNumber = pullRequestNumber(pullRequestUrl);

  return (
    <>
      <section
        aria-labelledby="progress-report-title"
        className="issue-progress rounded-[20px] border border-zk-border bg-zk-surface px-5 py-[18px]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="progress-report-title" className="cap">
            Progress report
          </h2>
          <span className={`chip ${chip.tone}`}>{chip.label}</span>
        </div>
        <div className="pgw">
          <div className="pg-track" aria-hidden="true">
            <span className="pg-fill" style={{ width: `${currentIndex * 25}%` }} />
          </div>
          <ol className="pg" aria-label="Progress report: pick a stage to see its logs">
            {DECISION_STAGES.map((stage, index) => {
              const state = stateOf(index);
              const tally = tallies[stage];
              const logs = tally.positive + tally.negative;
              const comments = commentCounts[stage];
              const on = stage === selected;
              const icon: IconName = state === "done" ? "check" : state === "warn" ? "undo" : stageIconName[stage];
              return (
                <li key={stage} style={{ animationDelay: `${index * 70}ms` }}>
                  <button
                    type="button"
                    aria-pressed={on}
                    title={decisionStageInfo[stage].description}
                    onClick={() => picked?.setStage(stage)}
                    className={`pgs${index === currentIndex ? " now" : ""}${state === "warn" ? " warn" : ""}${
                      state === "todo" ? " todo" : ""
                    }${on ? " sel" : ""}`}
                  >
                    <span className={`pgd ${state}`}>
                      <StageIcon name={icon} />
                    </span>
                    <span className="pgl">{decisionStageInfo[stage].label}</span>
                    <span className="pgn">{logs ? plural(logs, "log") : index > currentIndex ? "not yet" : "0 logs"}</span>
                    {comments ? <span className="pgc">{plural(comments, "comment")}</span> : null}
                    <span className="sr-only">
                      {decisionStageInfo[stage].label}: {tally.positive} positive, {tally.negative} negative
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="pgsum">
          <span>
            <b>{info.label}</b> · {info.description}
          </span>
          <span className="mono text-xs text-zk-muted">
            {plural(inStage.length, "log")} · {plural(commentCounts[selected], "comment")}
          </span>
        </div>
      </section>

      <section
        id="agent-decisions"
        aria-labelledby="agent-decisions-title"
        className="issue-progress scroll-mt-24 rounded-[20px] border border-zk-border bg-zk-surface px-5 py-[18px]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="agent-decisions-title" className="cap">
            Agent decisions <span className="mono">{inStage.length}</span>
          </h2>
          <span className="chip cn">{info.label} stage</span>
        </div>
        {inStage.length > 0 ? (
          <>
            <div className="h-0.5" />
            {inStage.map((decision, index) => {
              const card = decisionCard(decision);
              return (
                <article
                  key={decision.id}
                  id={`agent-decision-${decision.id}`}
                  className="cm lg"
                  style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}
                >
                  <div className="cmh">
                    <span className={`av ${card.tone}`}>
                      <StageIcon name={card.icon} />
                    </span>
                    <b>{decision.agentName}</b>
                    <span className="chip cn">agent</span>
                    <span className={`chip ${card.tone}`}>{card.label}</span>
                    <LocalTime compact className="dt" date={decision.at} />
                  </div>
                  <p className="cmb">{card.text}</p>
                  {card.notes ? <p className="cmb whitespace-pre-wrap break-words">{card.notes}</p> : null}
                </article>
              );
            })}
          </>
        ) : (
          <div className="emp lg">
            <div className="flex items-start gap-2.5">
              <span className="emp-icon">
                <StageIcon name={stageIconName[selected]} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13.5px] font-semibold text-zk-text">
                  {awaitingTests ? "No merge decisions yet" : info.emptyTitle}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-normal text-zk-muted">
                  {awaitingTests
                    ? "Reviewer agents must test the implementation against the acceptance criteria before it can be marked good or not good to merge."
                    : info.emptyText}
                </p>
              </div>
            </div>
            {awaitingTests ? (
              <ol aria-label="Before a merge decision" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                <EmptyStep state="done" label={prNumber ? `PR ${prNumber}` : "Pull request"} note="Pull request submitted" />
                <EmptyStep state="now" label="Testing" note="Being tested by reviewer agents" />
                <EmptyStep state="todo" label="Merge decision" note="Not reached yet" />
              </ol>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

function EmptyStep({ state, label, note }: { state: "done" | "now" | "todo"; label: string; note: string }) {
  const row =
    state === "now"
      ? "bg-[var(--color-violet-50)] font-semibold text-[var(--color-violet-700)]"
      : state === "done"
        ? "bg-zk-chip text-zk-text2"
        : "bg-zk-chip text-zk-muted";
  const dot =
    state === "done"
      ? "bg-zk-ok-bg text-zk-ok-fg"
      : state === "now"
        ? "bg-[var(--color-violet-50)] text-[var(--color-violet-700)]"
        : "border-[1.5px] border-dashed border-zk-border text-zk-muted";
  return (
    <li title={note} className={`inline-flex items-center gap-1.5 rounded-full py-[3px] pl-1 pr-2.5 text-xs ${row}`}>
      <span className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full ${dot}`} aria-hidden="true">
        <StageIcon name={state === "done" ? "check" : state === "now" ? "eye" : "timer"} style={{ width: 9, height: 9 }} />
      </span>
      {label}
    </li>
  );
}
