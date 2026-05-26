import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bunGit, merge } from "./git.ts";

let dir: string;

async function git(args: string[]): Promise<void> {
  await bunGit(args, dir);
}

/** Inits a repo on `base` with one file, plus a `feature` branch off it. */
async function seed(featureEdits: () => void): Promise<void> {
  writeFileSync(join(dir, "f.txt"), "base\n");
  await git(["init", "-q", "-b", "base"]);
  await git(["config", "user.email", "t@t.t"]);
  await git(["config", "user.name", "t"]);
  await git(["config", "commit.gpgsign", "false"]);
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "base"]);
  await git(["switch", "-q", "-c", "feature"]);
  featureEdits();
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "feature"]);
  await git(["switch", "-q", "base"]);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crew-merge-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("merge (real git)", () => {
  test("a non-conflicting branch merges cleanly", async () => {
    await seed(() => writeFileSync(join(dir, "g.txt"), "feature-only\n"));
    const result = await merge(dir, "feature");
    expect(result.ok).toBe(true);
  });

  test("a conflicting branch reports conflict (and is left in progress)", async () => {
    await seed(() => writeFileSync(join(dir, "f.txt"), "feature-change\n"));
    // Diverge base so the same file conflicts.
    writeFileSync(join(dir, "f.txt"), "base-change\n");
    await git(["commit", "-aqm", "base diverge"]);

    const result = await merge(dir, "feature");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict).toBe(true);
  });

  test("merging a nonexistent branch is a non-conflict failure", async () => {
    await seed(() => writeFileSync(join(dir, "g.txt"), "x\n"));
    const result = await merge(dir, "ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict).toBe(false);
  });
});
