import { describe, expect, test } from "bun:test";
import { type InstallSource, parseInstallArg } from "./installSource.ts";

function ok(raw: string): InstallSource {
  const r = parseInstallArg(raw);
  if ("error" in r) throw new Error(`expected success, got error: ${r.error}`);
  return r;
}

describe("parseInstallArg", () => {
  test("GitHub owner/repo shorthand expands to an https clone url", () => {
    const s = ok("anthropics/claude-skills");
    expect(s.url).toBe("https://github.com/anthropics/claude-skills.git");
    expect(s.name).toBe("claude-skills");
    expect(s.ref).toBeUndefined();
    expect(s.scope).toBe("project");
  });

  test("--global flag sets scope and is order-independent", () => {
    expect(ok("owner/repo --global").scope).toBe("global");
    expect(ok("--global owner/repo").scope).toBe("global");
    expect(ok("owner/repo").scope).toBe("project");
  });

  test("#ref selects a branch/tag/commit", () => {
    const s = ok("owner/repo#v2");
    expect(s.url).toBe("https://github.com/owner/repo.git");
    expect(s.ref).toBe("v2");
    expect(s.name).toBe("repo");
  });

  test("full https url is kept and name taken from the last path segment", () => {
    const s = ok("https://gitlab.com/group/my-plugin.git");
    expect(s.url).toBe("https://gitlab.com/group/my-plugin.git");
    expect(s.name).toBe("my-plugin");
  });

  test("https url without .git suffix still derives a name", () => {
    expect(ok("https://github.com/owner/cool-thing").name).toBe("cool-thing");
  });

  test("scp-style git@ url is preserved", () => {
    const s = ok("git@github.com:owner/repo.git");
    expect(s.url).toBe("git@github.com:owner/repo.git");
    expect(s.name).toBe("repo");
  });

  test("empty or flag-only input is an error", () => {
    expect("error" in parseInstallArg("")).toBe(true);
    expect("error" in parseInstallArg("   ")).toBe(true);
    expect("error" in parseInstallArg("--global")).toBe(true);
  });

  test("path-traversal or unsafe names are rejected", () => {
    expect("error" in parseInstallArg("../../etc")).toBe(true);
    expect("error" in parseInstallArg("https://host/a/..")).toBe(true);
  });

  test("a bare word that is not a repo spec is an error", () => {
    expect("error" in parseInstallArg("notarepo")).toBe(true);
  });
});
