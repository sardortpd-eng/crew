import { describe, expect, test } from "bun:test";
import { COMMAND_CATALOG } from "./commandCatalog.ts";
import { completeWith, suggestCommands } from "./commandSuggest.ts";

function names(value: string): string[] {
  const r = suggestCommands(value);
  return r.mode === "list" ? r.matches.map((m) => m.name) : [];
}

describe("suggestCommands", () => {
  test("non-slash input suggests nothing", () => {
    expect(suggestCommands("hello there").mode).toBe("none");
    expect(suggestCommands("").mode).toBe("none");
  });

  test("a lone slash lists the whole catalog", () => {
    const r = suggestCommands("/");
    expect(r.mode).toBe("list");
    if (r.mode === "list") expect(r.matches.length).toBe(COMMAND_CATALOG.length);
  });

  test("prefix matches rank before substring matches", () => {
    const list = names("/mo");
    // both "mode" and "model" start with "mo"
    expect(list).toContain("mode");
    expect(list).toContain("model");
    expect(list.indexOf("mode")).toBeLessThan(2);
  });

  test("a more specific query narrows the list", () => {
    expect(names("/model")).toContain("model");
    // "install" prefix-matches; "uninstall" only substring-matches, so it ranks after.
    const inst = names("/inst");
    expect(inst[0]).toBe("install");
    expect(inst).toContain("uninstall");
  });

  test("aliases match too", () => {
    expect(names("/?")).toContain("help");
    expect(names("/wt")).toContain("worktrees");
  });

  test("an unknown command yields an empty list (still list mode, so the menu can say 'no match')", () => {
    const r = suggestCommands("/zzzz");
    expect(r.mode).toBe("list");
    if (r.mode === "list") expect(r.matches).toEqual([]);
  });

  test("once the name is typed and a space follows, it becomes an arg hint", () => {
    const r = suggestCommands("/mode ");
    expect(r.mode).toBe("hint");
    if (r.mode === "hint") expect(r.spec.name).toBe("mode");
  });

  test("a hint for an unknown command is suppressed", () => {
    expect(suggestCommands("/bogus arg").mode).toBe("none");
  });
});

describe("completeWith", () => {
  test("produces the slash command plus a trailing space", () => {
    const spec = COMMAND_CATALOG.find((c) => c.name === "mode");
    if (!spec) throw new Error("missing");
    expect(completeWith(spec)).toBe("/mode ");
  });
});
