import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: planner", () => {
  test("/plan captures the goal", () => {
    expect(parseCommand("/plan build a todo app with auth")).toEqual({
      kind: "plan",
      goal: "build a todo app with auth",
    });
  });

  test("/plan without a goal is an error", () => {
    expect(parseCommand("/plan")).toMatchObject({ kind: "error" });
  });

  test("/run and /tasks", () => {
    expect(parseCommand("/run")).toEqual({ kind: "run" });
    expect(parseCommand("/tasks")).toEqual({ kind: "tasks" });
  });
});
