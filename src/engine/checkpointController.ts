import {
  bunGit,
  commitAll,
  createBranch,
  headSha,
  isGitRepo,
  resetHard,
  showStat,
  type GitRunner,
} from "./git.ts";
import type { CheckpointInfo } from "../state/store.ts";

export type CheckpointDeps = {
  readonly cwd: string;
  readonly run?: GitRunner;
  /** Pushes the current branch + checkpoint list to the store. */
  readonly onChange?: (branch: string | null, checkpoints: readonly CheckpointInfo[]) => void;
  /** Clock for the branch name; injectable for tests. */
  readonly now?: () => number;
};

export type CheckpointResult = { ok: boolean; message: string };

/**
 * Git-backed checkpoints. On the first checkpoint, crew branches to
 * `crew/<timestamp>` (so your working branch is untouched) and commits the tree
 * after each green turn. `/undo` hard-resets to the previous checkpoint.
 */
export class CheckpointController {
  private readonly deps: CheckpointDeps;
  private readonly run: GitRunner;
  private repoChecked = false;
  private isRepo = false;
  private branch: string | null = null;
  private baseSha: string | null = null;
  private stack: CheckpointInfo[] = [];

  constructor(deps: CheckpointDeps) {
    this.deps = deps;
    this.run = deps.run ?? bunGit;
  }

  /** Commits the working tree as a checkpoint (commit-on-green). */
  async checkpoint(agentId: string, label: string): Promise<CheckpointResult> {
    if (!(await this.ensureBranch())) {
      return { ok: false, message: "not a git repo — checkpoints off" };
    }
    const result = await commitAll(this.deps.cwd, `crew(${agentId}): ${trim(label)}`, this.run);
    if (result.error) return { ok: false, message: `checkpoint failed: ${result.error}` };
    if (!result.committed || !result.sha) return { ok: false, message: "nothing to checkpoint" };

    this.stack = [...this.stack, { sha: result.sha, agentId, label: trim(label) }];
    this.notify();
    return { ok: true, message: `✓ checkpoint ${short(result.sha)} on ${this.branch}` };
  }

  /** Rolls the tree back to the previous checkpoint (or the branch base). */
  async undo(): Promise<CheckpointResult> {
    const last = this.stack.at(-1);
    if (!last) return { ok: false, message: "no checkpoints to undo" };
    const target = this.stack.length >= 2 ? this.stack[this.stack.length - 2]?.sha : this.baseSha;
    if (!target) return { ok: false, message: "nothing earlier to undo to" };

    if (!(await resetHard(this.deps.cwd, target, this.run))) {
      return { ok: false, message: "undo failed (git reset)" };
    }
    this.stack = this.stack.slice(0, -1);
    this.notify();
    return { ok: true, message: `↩ undid ${last.agentId}'s checkpoint (${short(last.sha)})` };
  }

  /** Returns a `--stat` summary of the latest checkpoint. */
  async diff(): Promise<string> {
    const last = this.stack.at(-1);
    if (!last) return "no checkpoints yet";
    return showStat(this.deps.cwd, last.sha, this.run);
  }

  /** Lazily verifies the repo and creates the crew branch on first use. */
  private async ensureBranch(): Promise<boolean> {
    if (!this.repoChecked) {
      this.isRepo = await isGitRepo(this.deps.cwd, this.run);
      this.repoChecked = true;
    }
    if (!this.isRepo) return false;
    if (this.branch) return true;

    this.baseSha = await headSha(this.deps.cwd, this.run);
    const name = branchName(this.deps.now?.() ?? Date.now());
    if (await createBranch(this.deps.cwd, name, this.run)) {
      this.branch = name;
      this.notify();
    }
    return this.branch !== null;
  }

  private notify(): void {
    this.deps.onChange?.(this.branch, [...this.stack]);
  }
}

function branchName(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `crew/${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function short(sha: string): string {
  return sha.slice(0, 7);
}

function trim(label: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean || "checkpoint";
}
