import { DECISION_STAGES, decisionStageInfo, type DecisionStage, type StageTallies } from "@/lib/decision-stages";

/** ✓ and ✕ counts for one stage; a zero side is left out (#1446). */
export function StageTallyCounts({
  stage,
  positive,
  negative,
}: {
  stage: DecisionStage;
  positive: number;
  negative: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-semibold tabular-nums">
      <span className="sr-only">
        {decisionStageInfo[stage].label}: {positive} positive, {negative} negative
      </span>
      {positive ? <span aria-hidden="true" className="text-zk-ok-fg">✓{positive}</span> : null}
      {negative ? <span aria-hidden="true" className="text-zk-bad-fg">✕{negative}</span> : null}
    </span>
  );
}

/**
 * The issues list card's stage strip (#1446): `Idea ✓8 ✕1 · Open ✓1 ✕1 · …`.
 * Stages with no decisions are left out; nothing renders when none have any.
 */
export function IssueRowStageTallies({ tallies }: { tallies: StageTallies | undefined }) {
  const shown = tallies
    ? DECISION_STAGES.filter((stage) => tallies[stage].positive + tallies[stage].negative > 0)
    : [];
  if (!tallies || shown.length === 0) return null;

  // Spans, not a list: the card's title block is phrasing content inside its link.
  return (
    <span className="issues-row-stages flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zk-muted">
      <span className="sr-only">Agent decisions by stage:</span>
      {shown.map((stage, index) => (
        <span key={stage} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          <span aria-hidden="true">{decisionStageInfo[stage].label}</span>
          <StageTallyCounts stage={stage} positive={tallies[stage].positive} negative={tallies[stage].negative} />
        </span>
      ))}
    </span>
  );
}
