import { LocalTime } from "@/components/local-time";
import {
  decisionSentence,
  timeOf,
  verdictVisual,
  VerdictGlyph,
  type AgentDecision,
} from "@/components/issue-agent-activity";

/**
 * What the merger agents decided on this issue, laid out like the
 * conversation below it: one entry per decision, oldest first. The intake,
 * claim and review decisions stay in the Agent decisions strip.
 */
export function MergeDecisions({ decisions }: { decisions: ReadonlyArray<AgentDecision> }) {
  const ordered = [...decisions].sort((a, b) => timeOf(a) - timeOf(b) || a.id.localeCompare(b.id));

  return (
    <section
      id="merge-decisions"
      aria-labelledby="merge-decisions-heading"
      className="scroll-mt-24 rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-[22px]"
    >
      <h2
        id="merge-decisions-heading"
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zk-muted"
      >
        Merge decisions
        <span className="font-mono font-normal normal-case tracking-normal">{ordered.length}</span>
      </h2>

      {ordered.length === 0 ? (
        <div
          role="status"
          className="mt-3 flex items-start gap-2.5 rounded-xl border border-dashed border-zk-border px-3.5 py-3"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zk-chip text-zk-muted [&_svg]:h-3.5 [&_svg]:w-3.5">
            <VerdictGlyph kind="accepted" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-zk-text">No merge decisions yet</p>
            <p className="mt-0.5 text-[12.5px] leading-normal text-zk-muted">Awaiting review by a merger.</p>
          </div>
        </div>
      ) : (
        <ol className="mt-3 flex flex-col gap-2.5">
          {ordered.map((decision) => {
            const visual = verdictVisual(decision);
            return (
              <li key={decision.id}>
                <article
                  id={`agent-decision-${decision.id}`}
                  className="scroll-mt-24 rounded-xl border border-zk-border bg-zk-surface px-4 py-3 target:border-zk-accent target:bg-zk-tint motion-safe:transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zk-muted">
                    <span
                      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full [&_svg]:h-3 [&_svg]:w-3 ${visual.iconWrap}`}
                    >
                      <VerdictGlyph
                        kind={decision.kind}
                        goodToMerge={decision.kind === "verdict" ? decision.goodToMerge : undefined}
                      />
                    </span>
                    <b className="text-[13px] text-zk-text">{decision.agentName}</b>
                    <span className="rounded-md bg-zk-chip px-1.5 py-0.5 text-[11px] font-semibold text-zk-text2">
                      agent
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${visual.chip}`}>
                      {visual.label}
                    </span>
                    <LocalTime compact className="basis-full sm:ml-auto sm:basis-auto" date={decision.at} />
                  </div>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-zk-text2">{decisionSentence(decision)}</p>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
