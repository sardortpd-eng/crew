/** Result of one git invocation. */
export type GitResult = {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

/** Runs `git <args>` in `cwd`. Injectable so the controller is testable. */
export type GitRunner = (args: readonly string[], cwd: string) => Promise<GitResult>;

/** Default runner: spawns `git` with an args array (no shell — no injection). */
export const bunGit: GitRunner = async (args, cwd) => {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
};

export async function isGitRepo(cwd: string, run: GitRunner = bunGit): Promise<boolean> {
  const res = await run(["rev-parse", "--is-inside-work-tree"], cwd);
  return res.ok && res.stdout === "true";
}

export async function headSha(cwd: string, run: GitRunner = bunGit): Promise<string | null> {
  const res = await run(["rev-parse", "HEAD"], cwd);
  return res.ok ? res.stdout : null;
}

export async function currentBranch(cwd: string, run: GitRunner = bunGit): Promise<string | null> {
  const res = await run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return res.ok ? res.stdout : null;
}

/** Creates and switches to a new branch. */
export async function createBranch(
  cwd: string,
  name: string,
  run: GitRunner = bunGit,
): Promise<boolean> {
  const res = await run(["switch", "-c", name], cwd);
  return res.ok;
}

export type CommitResult = { committed: boolean; sha?: string; error?: string };

/** Stages everything and commits. Returns committed:false when the tree is clean. */
export async function commitAll(
  cwd: string,
  message: string,
  run: GitRunner = bunGit,
): Promise<CommitResult> {
  await run(["add", "-A"], cwd);
  const res = await run(["commit", "-m", message], cwd);
  if (!res.ok) {
    const out = `${res.stdout} ${res.stderr}`;
    if (/nothing to commit|no changes added/i.test(out)) return { committed: false };
    return { committed: false, error: res.stderr || res.stdout };
  }
  const sha = await headSha(cwd, run);
  return { committed: true, sha: sha ?? undefined };
}

/** Hard-resets the working tree + index to a commit. */
export async function resetHard(
  cwd: string,
  sha: string,
  run: GitRunner = bunGit,
): Promise<boolean> {
  const res = await run(["reset", "--hard", sha], cwd);
  return res.ok;
}

/** Returns a `--stat` summary for a commit (default HEAD). */
export async function showStat(
  cwd: string,
  ref = "HEAD",
  run: GitRunner = bunGit,
): Promise<string> {
  const res = await run(["show", "--stat", "--oneline", ref], cwd);
  return res.ok ? res.stdout : res.stderr || "no diff";
}

/**
 * Adds a worktree at `path` on `branch`. Creates the branch (`-b`); if it
 * already exists, checks it out into the new worktree instead. Returns true if
 * the worktree exists afterward (including when it was already there).
 */
export async function worktreeAdd(
  repoRoot: string,
  path: string,
  branch: string,
  run: GitRunner = bunGit,
): Promise<boolean> {
  const created = await run(["worktree", "add", path, "-b", branch], repoRoot);
  if (created.ok) return true;
  // Branch already exists → attach the existing branch to the new worktree.
  const attached = await run(["worktree", "add", path, branch], repoRoot);
  if (attached.ok) return true;
  // The worktree path itself already exists (prior session) → reuse it.
  return /already (exists|used|checked out)/i.test(`${attached.stdout} ${attached.stderr}`);
}

/** Removes a worktree (force, to allow uncommitted changes). Keeps the branch. */
export async function worktreeRemove(
  repoRoot: string,
  path: string,
  run: GitRunner = bunGit,
): Promise<boolean> {
  const res = await run(["worktree", "remove", "--force", path], repoRoot);
  return res.ok;
}
