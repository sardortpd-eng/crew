import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand", () => {
  test("plain text becomes a message", () => {
    expect(parseCommand("hello there")).toEqual({ kind: "message", text: "hello there" });
  });

  test("/spawn with task", () => {
    expect(parseCommand("/spawn reviewer review the diff")).toEqual({
      kind: "spawn",
      preset: "reviewer",
      task: "review the diff",
    });
  });

  test("/spawn without task", () => {
    expect(parseCommand("/spawn coder")).toEqual({ kind: "spawn", preset: "coder" });
  });

  test("/spawn without preset is an error", () => {
    expect(parseCommand("/spawn")).toMatchObject({ kind: "error" });
  });

  test("/broadcast requires a task", () => {
    expect(parseCommand("/broadcast run the tests")).toEqual({
      kind: "broadcast",
      task: "run the tests",
    });
    expect(parseCommand("/broadcast")).toMatchObject({ kind: "error" });
  });

  test("/stop with and without id", () => {
    expect(parseCommand("/stop coder-1")).toEqual({ kind: "stop", id: "coder-1" });
    expect(parseCommand("/stop")).toEqual({ kind: "stop" });
  });

  test("/focus requires a target", () => {
    expect(parseCommand("/focus 2")).toEqual({ kind: "focus", target: "2" });
    expect(parseCommand("/focus")).toMatchObject({ kind: "error" });
  });

  test("aliases: /q and /exit quit, /rm removes, /? helps", () => {
    expect(parseCommand("/q")).toEqual({ kind: "quit" });
    expect(parseCommand("/exit")).toEqual({ kind: "quit" });
    expect(parseCommand("/rm coder-1")).toEqual({ kind: "remove", id: "coder-1" });
    expect(parseCommand("/?")).toEqual({ kind: "help" });
  });

  test("unknown command is an error", () => {
    expect(parseCommand("/wat")).toMatchObject({ kind: "error" });
  });
});
