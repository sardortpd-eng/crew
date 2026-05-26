import { describe, expect, test } from "bun:test";
import {
  commitAll,
  createBranch,
  isGitRepo,
  resetHard,
  type GitResult,
  type GitRunner,
} from "./git.ts";

const ok = (stdout = ""): GitResult => ({ ok: true, stdout, stderr: "", exitCode: 0 });
const fail = (stderr = "", stdout = ""): GitResult => ({ ok: false, stdout, stderr, exitCode: 1 });

/** Records the git args each call received and replies from a scripted queue. */
function recorder(replies: GitResult[]) {
  const calls: string[][] = [];
  let i = 0;
  const run: GitRunner = async (args) => {
    calls.push([...args]);
    return replies[i++] ?? ok();
  };
  return { run, calls };
}

describe("git ops", () => {
  test("isGitRepo parses rev-parse output", async () => {
    const { run } = recorder([ok("true")]);
    expect(await isGitRepo("/x", run)).toBe(true);
    const no = recorder([fail()]);
    expect(await isGitRepo("/x", no.run)).toBe(false);
  });

  test("createBranch uses switch -c", async () => {
    const { run, calls } = recorder([ok()]);
    await createBranch("/x", "crew/123", run);
    expect(calls[0]).toEqual(["switch", "-c", "crew/123"]);
  });

  test("commitAll stages, commits, and returns the new sha", async () => {
    const { run, calls } = recorder([ok(), ok(), ok("abc123")]);
    const result = await commitAll("/x", "crew(coder-1): task", run);
    expect(calls[0]).toEqual(["add", "-A"]);
    expect(calls[1]).toEqual(["commit", "-m", "crew(coder-1): task"]);
    expect(result).toEqual({ committed: true, sha: "abc123" });
  });

  test("commitAll returns committed:false on a clean tree", async () => {
    const { run } = recorder([ok(), fail("", "nothing to commit, working tree clean")]);
    const result = await commitAll("/x", "msg", run);
    expect(result.committed).toBe(false);
    expect(result.error).toBeUndefined();
  });

  test("resetHard targets the given sha", async () => {
    const { run, calls } = recorder([ok()]);
    await resetHard("/x", "base999", run);
    expect(calls[0]).toEqual(["reset", "--hard", "base999"]);
  });
});
