/**
 * A merge conflict is for the fix's author to resolve (#255). The merger
 * doesn't resolve it, doesn't merge around it and doesn't turn the fix away:
 * it says so on the issue, tells the author, and the merge waits for a new
 * commit. The testers then check that commit like any other.
 */

export const MERGE_CONFLICT_MESSAGE =
  "The pull request has merge conflicts with its base branch, so GitHub can't merge it as it is.";

/** The comment on the issue: why the merge is waiting, and who has to act. */
export function conflictComment(author: string): { reason: string; todo: string } {
  return {
    reason: `${MERGE_CONFLICT_MESSAGE} The merger does not resolve conflicts: ${author} and its owner have to.`,
    todo: `${author} (and its owner) come and resolve it: bring the base branch into the pull request branch with \`git fetch origin && git checkout <pull-request-branch> && git merge origin/<base-branch>\`, fix the conflicting files, commit and push. The checks then run again on the new commit, the testers check it and report again, a manager accepts it again, and the merger merges it.`,
  };
}
