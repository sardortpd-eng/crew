import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: checkpoints", () => {
  test("/undo and /diff", () => {
    expect(parseCommand("/undo")).toEqual({ kind: "undo" });
    expect(parseCommand("/diff")).toEqual({ kind: "diff" });
  });

  test("/checkpoint with and without a label (and /cp alias)", () => {
    expect(parseCommand("/checkpoint")).toEqual({ kind: "checkpoint" });
    expect(parseCommand("/checkpoint before refactor")).toEqual({
      kind: "checkpoint",
      label: "before refactor",
    });
    expect(parseCommand("/cp wip")).toEqual({ kind: "checkpoint", label: "wip" });
  });

  test("/checkpoint auto|ask|off sets the auto-checkpoint mode", () => {
    expect(parseCommand("/checkpoint auto")).toEqual({ kind: "checkpoint", mode: "auto" });
    expect(parseCommand("/checkpoint ask")).toEqual({ kind: "checkpoint", mode: "ask" });
    expect(parseCommand("/checkpoint off")).toEqual({ kind: "checkpoint", mode: "off" });
    expect(parseCommand("/cp auto")).toEqual({ kind: "checkpoint", mode: "auto" });
  });

  test("a non-mode word is still a label", () => {
    expect(parseCommand("/checkpoint asking the user")).toEqual({
      kind: "checkpoint",
      label: "asking the user",
    });
  });
});
