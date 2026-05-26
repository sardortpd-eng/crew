/**
 * Pure ordering for parallel task runs. Tasks run concurrently in isolated
 * worktrees, but their branches must be merged back into a shared base **in
 * board order** and only up to the first failure — integrating on top of a
 * broken task would cascade the breakage. This decides which to merge.
 */

export type TaskOutcomeEntry = {
  readonly id: string;
  readonly outcome: "done" | "failed";
};

/**
 * Task ids to merge, in the given (board) order, stopping before the first
 * failed task. The rest stay as worktrees the user can fix and `/merge`.
 */
export function greenMergeOrder(results: readonly TaskOutcomeEntry[]): string[] {
  const out: string[] = [];
  for (const r of results) {
    if (r.outcome === "failed") break;
    out.push(r.id);
  }
  return out;
}
