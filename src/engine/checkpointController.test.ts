import { describe, expect, test } from "bun:test";
import { CheckpointController } from "./checkpointController.ts";
import type { GitResult, GitRunner } from "./git.ts";

const ok = (stdout = ""): GitResult => ({ ok: true, stdout, stderr: "", exitCode: 0 });

/**
 * A fake git that simulates a repo: tracks HEAD, branch, and whether the tree is
 * dirty. `markDirty()` makes the next commit succeed with a new sha.
 */
function fakeGit() {
  let head = "base000";
  let branch = "main";
  let dirty = false;
  let counter = 0;
  const calls: string[][] = [];

  const run: GitRunner = async (args) => {
    calls.push([...args]);
    const [cmd] = args;
    if (cmd === "rev-parse" && args[1] === "--is-inside-work-tree") return ok("true");
    if (cmd === "rev-parse" && args[1] === "HEAD") return ok(head);
    if (cmd === "rev-parse") return ok(branch);
    if (cmd === "switch") {
      branch = args[2] ?? branch;
      return ok();
    }
    if (cmd === "add") return ok();
    if (cmd === "commit") {
      if (!dirty)
        return {
          ok: false,
          stdout: "nothing to commit, working tree clean",
          stderr: "",
          exitCode: 1,
        };
      dirty = false;
      head = `sha${++counter}`;
      return ok();
    }
    if (cmd === "reset") {
      head = args[2] ?? head;
      return ok();
    }
    if (cmd === "show") return ok("file.ts | 2 +-");
    return ok();
  };

  return {
    run,
    calls,
    markDirty: () => {
      dirty = true;
    },
    head: () => head,
  };
}

const deps = (git: ReturnType<typeof fakeGit>) => ({
  cwd: "/repo",
  run: git.run,
  now: () => 1_700_000_000_000,
});

describe("CheckpointController", () => {
  test("first checkpoint creates a crew branch and commits", async () => {
    const git = fakeGit();
    const branches: (string | null)[] = [];
    const c = new CheckpointController({ ...deps(git), onChange: (b) => branches.push(b) });

    git.markDirty();
    const res = await c.checkpoint("coder-1", "add health route");

    expect(res.ok).toBe(true);
    expect(git.calls.some((a) => a[0] === "switch" && a[1] === "-c")).toBe(true);
    expect(branches.at(-1)).toMatch(/^crew\//);
    expect(res.message).toContain("checkpoint");
  });

  test("clean tree → nothing to checkpoint", async () => {
    const git = fakeGit();
    const c = new CheckpointController(deps(git));
    const res = await c.checkpoint("coder-1", "noop");
    expect(res.ok).toBe(false);
    expect(res.message).toContain("nothing");
  });

  test("undo resets to the previous checkpoint", async () => {
    const git = fakeGit();
    const c = new CheckpointController(deps(git));

    git.markDirty();
    await c.checkpoint("coder-1", "first"); // sha1 (base000 → branch base)
    git.markDirty();
    await c.checkpoint("coder-1", "second"); // sha2

    const res = await c.undo(); // back to sha1
    expect(res.ok).toBe(true);
    expect(git.head()).toBe("sha1");

    const res2 = await c.undo(); // back to base000
    expect(res2.ok).toBe(true);
    expect(git.head()).toBe("base000");

    const res3 = await c.undo(); // nothing left
    expect(res3.ok).toBe(false);
  });

  test("disabled outside a git repo", async () => {
    const run: GitRunner = async (args) =>
      args[1] === "--is-inside-work-tree"
        ? { ok: false, stdout: "", stderr: "not a repo", exitCode: 128 }
        : ok();
    const c = new CheckpointController({ cwd: "/tmp", run, now: () => 0 });
    const res = await c.checkpoint("coder-1", "x");
    expect(res.ok).toBe(false);
    expect(res.message).toContain("not a git repo");
  });
});
