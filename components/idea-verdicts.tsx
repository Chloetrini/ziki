import { LocalTime } from "@/components/local-time";
import { IdeaVerdictForm } from "@/components/idea-verdict-form";

export type IdeaOpinionName = "good" | "bad" | "neutral";

export type IdeaVerdictView = {
  id: string;
  opinion: IdeaOpinionName;
  votes: number;
  summary: string;
  description: string;
  onBehalfOfUserId: string;
  by: string;
  agentName: string | null;
  updatedAt: Date | string;
};

export type IdeaVerdictsData = {
  ideaScore: number;
  ideaThreshold: number;
  votes: Record<IdeaOpinionName, number>;
  verdicts: IdeaVerdictView[];
};

/** Why the viewer can't give a verdict, or null when they can. */
export type IdeaVerdictBlock = "own" | "closed" | "deleted" | null;

const BLOCK_REASON: Record<Exclude<IdeaVerdictBlock, null>, string> = {
  own: "This is your idea, so you can't give it a verdict.",
  closed: "This idea is closed, so it takes no more verdicts.",
  deleted: "This idea is deleted.",
};

export const opinionLabels: Record<IdeaOpinionName, string> = { good: "Good", bad: "Bad", neutral: "Neutral" };

export const opinionChipClass: Record<IdeaOpinionName, string> = {
  good: "bg-zk-ok-bg text-zk-ok-fg",
  bad: "bg-zk-bad-bg text-zk-bad-fg",
  neutral: "bg-zk-chip text-zk-text2",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Score 2 of 3": the idea's net score against the project's threshold. */
export function ideaScoreText(score: number, threshold: number): string {
  return `Score ${score} of ${threshold}`;
}

/** Good, bad and neutral vote totals, as compact chips. */
export function IdeaVoteTotals({ votes, className = "" }: { votes: Record<IdeaOpinionName, number>; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[13px] font-semibold tabular-nums ${className}`}>
      <span className="text-zk-ok-fg" title={`${plural(votes.good, "good vote")}`}>
        <span aria-hidden="true">▲</span>
        {votes.good}
        <span className="sr-only"> good</span>
      </span>
      <span className="text-zk-bad-fg" title={`${plural(votes.bad, "bad vote")}`}>
        <span aria-hidden="true">▼</span>
        {votes.bad}
        <span className="sr-only"> bad</span>
      </span>
      <span className="text-zk-muted" title={`${plural(votes.neutral, "neutral vote")}`}>
        <span aria-hidden="true">●</span>
        {votes.neutral}
        <span className="sr-only"> neutral</span>
      </span>
    </span>
  );
}

/**
 * The idea stage (#idea-verdicts): the score against the threshold, the vote
 * totals, every verdict and, for a signed-in person, a form to give theirs.
 */
export function IdeaVerdictsPanel({
  bugId,
  data,
  viewerId,
  block,
  summaryMaxChars,
}: {
  bugId: string;
  data: IdeaVerdictsData;
  viewerId: string | null;
  block: IdeaVerdictBlock;
  summaryMaxChars: number;
}) {
  const reached = data.ideaScore >= data.ideaThreshold;
  const mine = viewerId ? data.verdicts.find((v) => v.onBehalfOfUserId === viewerId) ?? null : null;

  return (
    <section
      id="idea-verdicts"
      aria-labelledby="idea-verdicts-heading"
      className="scroll-mt-24 rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-[22px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="idea-verdicts-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-zk-muted">
            Idea verdicts
          </h2>
          <p className="mt-1 text-[13px] leading-normal text-zk-text2">
            {reached
              ? "It has reached the threshold. A manager agent can convert it to an issue."
              : "Good adds a vote, bad takes one away. A manager agent converts it at the threshold."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right" aria-label="Idea score">
          <span
            data-testid="idea-score"
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${reached ? "bg-zk-ok-bg text-zk-ok-fg" : "bg-zk-tint text-zk-accent"}`}
          >
            {ideaScoreText(data.ideaScore, data.ideaThreshold)}
          </span>
          <IdeaVoteTotals votes={data.votes} />
        </div>
      </div>

      {data.verdicts.length === 0 ? (
        <p className="mt-3 text-[13px] text-zk-muted">No verdicts yet.</p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
          {data.verdicts.map((verdict) => (
            <li key={verdict.id} className="rounded-xl border border-zk-divider px-3 py-2.5">
              <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${opinionChipClass[verdict.opinion]}`}>
                  {opinionLabels[verdict.opinion]}
                </span>
                <b className="font-semibold text-zk-text">{verdict.by}</b>
                {verdict.agentName ? <span className="text-zk-muted">via {verdict.agentName}</span> : null}
                {verdict.votes > 1 ? <span className="text-zk-muted">· {plural(verdict.votes, "vote")}</span> : null}
                <span className="whitespace-nowrap text-xs text-zk-muted">
                  · <LocalTime compact date={verdict.updatedAt} />
                </span>
              </p>
              <p className="mb-0 mt-1 break-words text-[13px] font-semibold leading-[1.5] text-zk-text">{verdict.summary}</p>
              <p className="mb-0 mt-1 whitespace-pre-line break-words text-[13px] leading-[1.5] text-zk-text2">{verdict.description}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-zk-divider pt-3.5 print:hidden">
        {block ? (
          <p className="m-0 text-[13px] text-zk-muted" data-testid="idea-verdict-blocked">
            {BLOCK_REASON[block]}
          </p>
        ) : viewerId ? (
          <IdeaVerdictForm
            bugId={bugId}
            summaryMaxChars={summaryMaxChars}
            initialOpinion={mine?.opinion ?? null}
            initialSummary={mine?.summary ?? ""}
          />
        ) : (
          <p className="m-0 text-[13px] text-zk-muted">Sign in to give a verdict.</p>
        )}
      </div>
    </section>
  );
}

/**
 * In place of the upvote button on an idea's row: its net verdict score,
 * labelled "score". Ideas take verdicts, not upvotes.
 */
export function IdeaScoreBadge({ score, threshold = null }: { score: number; threshold?: number | null }) {
  const label = threshold === null ? `Idea score ${score}` : `Idea score ${score} of ${threshold}`;
  return (
    <span
      data-testid="idea-score-badge"
      aria-label={label}
      title={label}
      className="inline-flex min-w-[2.75rem] flex-col items-center justify-center rounded-lg border border-dashed border-zk-border px-2 py-1 text-xs font-semibold text-zk-text"
    >
      <span className="tabular-nums leading-tight">{score}</span>
      <span className="text-[10px] font-medium leading-tight text-zk-muted">score</span>
    </span>
  );
}
