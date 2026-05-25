import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /preset", () => {
  test("/preset and /presets list", () => {
    expect(parseCommand("/preset")).toEqual({ kind: "preset", op: { type: "list" } });
    expect(parseCommand("/presets")).toEqual({ kind: "preset", op: { type: "list" } });
    expect(parseCommand("/preset list")).toEqual({ kind: "preset", op: { type: "list" } });
  });

  test("/preset reload", () => {
    expect(parseCommand("/preset reload")).toEqual({ kind: "preset", op: { type: "reload" } });
  });

  test("/preset rm requires a name", () => {
    expect(parseCommand("/preset rm tester")).toEqual({
      kind: "preset",
      op: { type: "remove", name: "tester" },
    });
    expect(parseCommand("/preset rm")).toMatchObject({ kind: "error" });
  });

  test("/preset new parses name/model/mode/tools and a multi-word prompt", () => {
    const result = parseCommand(
      "/preset new tester sonnet acceptEdits Read,Bash You run the tests.",
    );
    expect(result).toEqual({
      kind: "preset",
      op: {
        type: "new",
        name: "tester",
        model: "sonnet",
        mode: "acceptEdits",
        tools: ["Read", "Bash"],
        prompt: "You run the tests.",
      },
    });
  });

  test("/preset new without enough args is an error", () => {
    expect(parseCommand("/preset new tester sonnet")).toMatchObject({ kind: "error" });
  });

  test("unknown subcommand is an error", () => {
    expect(parseCommand("/preset wat")).toMatchObject({ kind: "error" });
  });
});
