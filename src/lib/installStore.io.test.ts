import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InstallSource } from "./installSource.ts";
import { type GitRunner, installFromGit, listInstalled, removeInstalled } from "./installStore.ts";

let work: string;
let remote: string;

/** Makes a local git repo with a command + a skill, usable as a clone source. */
async function makeRemote(): Promise<void> {
  mkdirSync(join(remote, "commands"), { recursive: true });
  mkdirSync(join(remote, "skills", "greeter"), { recursive: true });
  writeFileSync(join(remote, "commands", "hi.md"), "# /hi\nSay hi.");
  writeFileSync(join(remote, "skills", "greeter", "SKILL.md"), "---\nname: greeter\n---\nGreet.");
  const run = (cmd: string) => Bun.spawn(["sh", "-c", cmd], { cwd: remote }).exited;
  await run(
    "git init -q && git add -A && git -c user.email=t@t.t -c user.name=t commit -q -m seed",
  );
}

beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), "crew-inst-work-"));
  remote = mkdtempSync(join(tmpdir(), "crew-inst-remote-"));
  await makeRemote();
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(remote, { recursive: true, force: true });
});

const source = (over: Partial<InstallSource> = {}): InstallSource => ({
  url: remote,
  name: "greeter-pack",
  scope: "project",
  ...over,
});

describe("installFromGit (real git)", () => {
  test("clones, synthesizes a manifest, registers, and lists", async () => {
    const result = await installFromGit(source(), { cwd: work });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { plugin } = result;
    expect(plugin.path).toBe(join(work, ".crew", "installed", "greeter-pack"));
    expect(existsSync(join(plugin.path, ".claude-plugin", "plugin.json"))).toBe(true);
    expect(plugin.components).toContain("1 command");
    expect(plugin.components).toContain("1 skill");

    const listed = listInstalled(work);
    expect(listed.map((p) => p.name)).toEqual(["greeter-pack"]);
  });

  test("refuses to install the same name twice", async () => {
    await installFromGit(source(), { cwd: work });
    const second = await installFromGit(source(), { cwd: work });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("already installed");
  });

  test("uninstall removes the directory and the registry entry", async () => {
    const r = await installFromGit(source(), { cwd: work });
    expect(r.ok).toBe(true);
    const path = r.ok ? r.plugin.path : "";

    const removed = removeInstalled("greeter-pack", work);
    expect(removed.ok).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(listInstalled(work)).toEqual([]);
  });

  test("uninstalling something not installed is a clean error", () => {
    const removed = removeInstalled("nope", work);
    expect(removed.ok).toBe(false);
  });
});

describe("installFromGit (failure paths, injected runner)", () => {
  test("a failed clone surfaces the git error and leaves nothing behind", async () => {
    const failing: GitRunner = async () => ({ code: 128, stderr: "fatal: repository not found\n" });
    const result = await installFromGit(source({ name: "ghost" }), { cwd: work, git: failing });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("repository not found");
    expect(existsSync(join(work, ".crew", "installed", "ghost"))).toBe(false);
  });

  test("a repo with no installable content is rejected and cleaned up", async () => {
    // Runner that 'succeeds' but creates an empty dir — no commands/skills/etc.
    const emptyClone: GitRunner = async (args) => {
      const dest = args[args.length - 1] ?? "";
      mkdirSync(dest, { recursive: true });
      writeFileSync(join(dest, "README.md"), "nothing here");
      return { code: 0, stderr: "" };
    };
    const result = await installFromGit(source({ name: "barren" }), { cwd: work, git: emptyClone });
    expect(result.ok).toBe(false);
    expect(existsSync(join(work, ".crew", "installed", "barren"))).toBe(false);
  });
});
