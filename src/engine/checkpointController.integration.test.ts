import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointController } from "./checkpointController.ts";
import { currentBranch } from "./git.ts";

let cwd: string;

async function git(args: string[]): Promise<void> {
  await Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" }).exited;
}

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "crew-ckpt-"));
  await git(["init"]);
  await git(["config", "user.email", "t@t.t"]);
  await git(["config", "user.name", "t"]);
  await git(["config", "commit.gpgsign", "false"]);
  writeFileSync(join(cwd, "file.txt"), "v1\n");
  await git(["add", "-A"]);
  await git(["commit", "-m", "base"]);
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("CheckpointController (real git)", () => {
  test("checkpoints on a crew branch and /undo reverts the working tree", async () => {
    const c = new CheckpointController({ cwd });

    // Agent "edits" the file, then a green turn checkpoints it.
    writeFileSync(join(cwd, "file.txt"), "v2\n");
    const first = await c.checkpoint("coder-1", "bump to v2");
    expect(first.ok).toBe(true);

    // It branched off main rather than committing onto it.
    expect(await currentBranch(cwd)).toMatch(/^crew\//);

    writeFileSync(join(cwd, "file.txt"), "v3\n");
    const second = await c.checkpoint("coder-1", "bump to v3");
    expect(second.ok).toBe(true);
    expect(readFileSync(join(cwd, "file.txt"), "utf8")).toBe("v3\n");

    // Undo the v3 checkpoint → back to v2.
    expect((await c.undo()).ok).toBe(true);
    expect(readFileSync(join(cwd, "file.txt"), "utf8")).toBe("v2\n");

    // Undo the v2 checkpoint → back to the branch base (v1).
    expect((await c.undo()).ok).toBe(true);
    expect(readFileSync(join(cwd, "file.txt"), "utf8")).toBe("v1\n");

    // Nothing left to undo.
    expect((await c.undo()).ok).toBe(false);
  });

  test("a clean tree produces no checkpoint", async () => {
    const c = new CheckpointController({ cwd });
    const res = await c.checkpoint("coder-1", "noop"); // creates branch, but nothing to commit
    expect(res.ok).toBe(false);
    expect(res.message).toContain("nothing");
  });
});
