import { describe, expect, test } from "bun:test";
import { WorktreeController } from "./worktrees.ts";
import type { GitResult, GitRunner } from "./git.ts";

const ok = (stdout = ""): GitResult => ({ ok: true, stdout, stderr: "", exitCode: 0 });

/** A fake git tracking HEAD per worktree path so checkpoints/undo are observable. */
function fakeGit() {
  const head = new Map<string, string>();
  const dirty = new Set<string>();
  let counter = 0;

  const run: GitRunner = async (args, cwd) => {
    const [cmd] = args;
    if (cmd === "rev-parse" && args[1] === "--is-inside-work-tree") return ok("true");
    if (cmd === "rev-parse" && args[1] === "HEAD") return ok(head.get(cwd) ?? "base");
    if (cmd === "worktree" && args[1] === "add") {
      head.set(args[2] ?? "", "base");
      return ok();
    }
    if (cmd === "worktree" && args[1] === "remove") return ok();
    if (cmd === "add") return ok();
    if (cmd === "commit") {
      if (!dirty.has(cwd))
        return { ok: false, stdout: "nothing to commit", stderr: "", exitCode: 1 };
      dirty.delete(cwd);
      head.set(cwd, `sha${++counter}`);
      return ok();
    }
    if (cmd === "reset") {
      head.set(cwd, args[2] ?? "base");
      return ok();
    }
    if (cmd === "show") return ok("stat");
    return ok();
  };
  return { run, markDirty: (p: string) => dirty.add(p), head: (p: string) => head.get(p) };
}

describe("WorktreeController", () => {
  test("acquire creates a worktree and is idempotent per agent", async () => {
    const git = fakeGit();
    const c = new WorktreeController({ repoRoot: "/repo", run: git.run });
    const p1 = await c.acquire("coder-1");
    const p2 = await c.acquire("coder-1");
    expect(p1).toBe("/repo/.crew/worktrees/coder-1");
    expect(p2).toBe(p1);
    expect(c.has("coder-1")).toBe(true);
  });

  test("checkpoint/undo are isolated per agent", async () => {
    const git = fakeGit();
    const c = new WorktreeController({ repoRoot: "/repo", run: git.run });
    const a = (await c.acquire("coder-1"))!;
    const b = (await c.acquire("coder-2"))!;

    git.markDirty(a);
    expect((await c.checkpoint("coder-1", "A1")).ok).toBe(true);
    git.markDirty(a);
    expect((await c.checkpoint("coder-1", "A2")).ok).toBe(true);
    git.markDirty(b);
    expect((await c.checkpoint("coder-2", "B1")).ok).toBe(true);

    const beforeB = git.head(b);
    await c.undo("coder-1"); // only coder-1's worktree moves
    expect(git.head(a)).toBe("sha1");
    expect(git.head(b)).toBe(beforeB);
  });

  test("acquire returns null outside a git repo", async () => {
    const run: GitRunner = async (args) =>
      args[1] === "--is-inside-work-tree"
        ? { ok: false, stdout: "", stderr: "", exitCode: 1 }
        : ok();
    const c = new WorktreeController({ repoRoot: "/tmp", run });
    expect(await c.acquire("coder-1")).toBeNull();
    expect(c.has("coder-1")).toBe(false);
  });

  test("release drops the agent; list reports entries", async () => {
    const git = fakeGit();
    const c = new WorktreeController({ repoRoot: "/repo", run: git.run });
    await c.acquire("coder-1");
    expect(c.list()).toHaveLength(1);
    await c.release("coder-1");
    expect(c.has("coder-1")).toBe(false);
    expect(c.list()).toHaveLength(0);
  });
});
