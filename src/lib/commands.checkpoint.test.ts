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
});
