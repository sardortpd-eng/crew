import { join } from "node:path";
import {
  bunGit,
  commitAll,
  headSha,
  isGitRepo,
  resetHard,
  showStat,
  worktreeAdd,
  worktreeRemove,
  type GitRunner,
} from "./git.ts";
import type { CheckpointInfo } from "../state/store.ts";

export type WorktreeDeps = {
  /** The repository root (crew's working directory). */
  readonly repoRoot: string;
  readonly run?: GitRunner;
};

export type WorktreeResult = { ok: boolean; message: string };

type Entry = {
  readonly path: string;
  readonly branch: string;
  baseSha: string | null;
  stack: CheckpointInfo[];
};

export type WorktreeInfo = {
  readonly agentId: string;
  readonly branch: string;
  readonly path: string;
  readonly checkpoints: number;
};

/**
 * Per-agent git worktrees: each builder agent gets its own checkout at
 * `.crew/worktrees/<agentId>` on branch `crew/wt-<agentId>`, so concurrent
 * agents never clobber each other. Each agent's worktree is its own checkpoint
 * trail (commit-on-green / undo operate on that worktree's branch).
 */
export class WorktreeController {
  private readonly repoRoot: string;
  private readonly run: GitRunner;
  private readonly agents = new Map<string, Entry>();
  private repoChecked = false;
  private isRepo = false;

  constructor(deps: WorktreeDeps) {
    this.repoRoot = deps.repoRoot;
    this.run = deps.run ?? bunGit;
  }

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  pathFor(agentId: string): string | undefined {
    return this.agents.get(agentId)?.path;
  }

  /** Creates (or reuses) an isolated worktree for an agent; null if unavailable. */
  async acquire(agentId: string): Promise<string | null> {
    const existing = this.agents.get(agentId);
    if (existing) return existing.path;

    if (!this.repoChecked) {
      this.isRepo = await isGitRepo(this.repoRoot, this.run);
      this.repoChecked = true;
    }
    if (!this.isRepo) return null;

    const path = join(this.repoRoot, ".crew", "worktrees", agentId);
    const branch = `crew/wt-${agentId}`;
    if (!(await worktreeAdd(this.repoRoot, path, branch, this.run))) return null;

    this.agents.set(agentId, { path, branch, baseSha: await headSha(path, this.run), stack: [] });
    return path;
  }

  /** Commits the agent's worktree as a checkpoint on its own branch. */
  async checkpoint(agentId: string, label: string): Promise<WorktreeResult> {
    const entry = this.agents.get(agentId);
    if (!entry) return { ok: false, message: "no worktree for this agent" };
    const result = await commitAll(entry.path, `crew(${agentId}): ${trim(label)}`, this.run);
    if (result.error) return { ok: false, message: `checkpoint failed: ${result.error}` };
    if (!result.committed || !result.sha) return { ok: false, message: "nothing to checkpoint" };
    entry.stack = [...entry.stack, { sha: result.sha, agentId, label: trim(label) }];
    return { ok: true, message: `✓ checkpoint ${short(result.sha)} on ${entry.branch}` };
  }

  /** Rolls the agent's worktree back to its previous checkpoint (or base). */
  async undo(agentId: string): Promise<WorktreeResult> {
    const entry = this.agents.get(agentId);
    if (!entry) return { ok: false, message: "no worktree for this agent" };
    const last = entry.stack.at(-1);
    if (!last) return { ok: false, message: "no checkpoints to undo" };
    const target =
      entry.stack.length >= 2 ? entry.stack[entry.stack.length - 2]?.sha : entry.baseSha;
    if (!target) return { ok: false, message: "nothing earlier to undo to" };
    if (!(await resetHard(entry.path, target, this.run))) {
      return { ok: false, message: "undo failed (git reset)" };
    }
    entry.stack = entry.stack.slice(0, -1);
    return { ok: true, message: `↩ undid ${agentId}'s checkpoint (${short(last.sha)})` };
  }

  async diff(agentId: string): Promise<string> {
    const entry = this.agents.get(agentId);
    const last = entry?.stack.at(-1);
    if (!entry || !last) return "no checkpoints yet";
    return showStat(entry.path, last.sha, this.run);
  }

  /** Removes an agent's worktree (its branch is preserved). */
  async release(agentId: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry) return;
    await worktreeRemove(this.repoRoot, entry.path, this.run);
    this.agents.delete(agentId);
  }

  async releaseAll(): Promise<void> {
    for (const id of [...this.agents.keys()]) await this.release(id);
  }

  list(): WorktreeInfo[] {
    return [...this.agents.entries()].map(([agentId, e]) => ({
      agentId,
      branch: e.branch,
      path: e.path,
      checkpoints: e.stack.length,
    }));
  }
}

function short(sha: string): string {
  return sha.slice(0, 7);
}

function trim(label: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean || "checkpoint";
}
