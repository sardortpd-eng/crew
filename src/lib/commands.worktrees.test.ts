import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /worktrees", () => {
  test("bare → list", () => {
    expect(parseCommand("/worktrees")).toEqual({ kind: "worktrees" });
  });

  test("on/off/list/clean actions (and /wt alias)", () => {
    expect(parseCommand("/worktrees on")).toEqual({ kind: "worktrees", action: "on" });
    expect(parseCommand("/wt off")).toEqual({ kind: "worktrees", action: "off" });
    expect(parseCommand("/worktrees clean")).toEqual({ kind: "worktrees", action: "clean" });
  });

  test("unknown action is an error", () => {
    expect(parseCommand("/worktrees sideways")).toMatchObject({ kind: "error" });
  });
});
