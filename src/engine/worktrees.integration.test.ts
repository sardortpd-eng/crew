import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorktreeController } from "./worktrees.ts";

let repo: string;

async function git(args: string[], cwd = repo): Promise<void> {
  await Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" }).exited;
}

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), "crew-wt-"));
  await git(["init"]);
  await git(["config", "user.email", "t@t.t"]);
  await git(["config", "user.name", "t"]);
  await git(["config", "commit.gpgsign", "false"]);
  writeFileSync(join(repo, "main.txt"), "main\n");
  await git(["add", "-A"]);
  await git(["commit", "-m", "base"]);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("WorktreeController (real git)", () => {
  test("two agents edit isolated worktrees; main tree untouched; per-agent undo", async () => {
    const c = new WorktreeController({ repoRoot: repo });
    const a = (await c.acquire("coder-1"))!;
    const b = (await c.acquire("coder-2"))!;
    expect(a).not.toBe(b);

    // Each agent edits its own file in its own worktree.
    writeFileSync(join(a, "a.txt"), "from A\n");
    writeFileSync(join(b, "b.txt"), "from B\n");
    expect((await c.checkpoint("coder-1", "add a")).ok).toBe(true);
    expect((await c.checkpoint("coder-2", "add b")).ok).toBe(true);

    // Worktrees are isolated; the main checkout never saw either file.
    expect(readFileSync(join(a, "a.txt"), "utf8")).toBe("from A\n");
    expect(() => readFileSync(join(repo, "a.txt"), "utf8")).toThrow();
    expect(() => readFileSync(join(repo, "b.txt"), "utf8")).toThrow();

    // A second edit + checkpoint on agent A, then undo reverts only A.
    writeFileSync(join(a, "a.txt"), "from A v2\n");
    await c.checkpoint("coder-1", "edit a");
    expect((await c.undo("coder-1")).ok).toBe(true);
    expect(readFileSync(join(a, "a.txt"), "utf8")).toBe("from A\n");
    expect(readFileSync(join(b, "b.txt"), "utf8")).toBe("from B\n"); // B unaffected

    await c.releaseAll();
  });
});
