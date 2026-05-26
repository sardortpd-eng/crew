import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /budget", () => {
  test("bare /budget shows the per-turn cap", () => {
    expect(parseCommand("/budget")).toEqual({ kind: "budget", scope: "turn" });
  });

  test("a dollar amount sets the per-turn cap (with or without $)", () => {
    expect(parseCommand("/budget 0.50")).toEqual({ kind: "budget", scope: "turn", usd: 0.5 });
    expect(parseCommand("/budget $2")).toEqual({ kind: "budget", scope: "turn", usd: 2 });
  });

  test("off/none/0 clear the per-turn cap", () => {
    expect(parseCommand("/budget off")).toEqual({ kind: "budget", scope: "turn", usd: null });
    expect(parseCommand("/budget 0")).toEqual({ kind: "budget", scope: "turn", usd: null });
  });

  test("/budget total sets/clears the session cap", () => {
    expect(parseCommand("/budget total 5")).toEqual({ kind: "budget", scope: "session", usd: 5 });
    expect(parseCommand("/budget total off")).toEqual({
      kind: "budget",
      scope: "session",
      usd: null,
    });
    expect(parseCommand("/budget total")).toEqual({ kind: "budget", scope: "session" });
  });

  test("a non-number is a usage error", () => {
    expect(parseCommand("/budget lots")).toMatchObject({ kind: "error" });
    expect(parseCommand("/budget -1")).toMatchObject({ kind: "error" });
    expect(parseCommand("/budget total nope")).toMatchObject({ kind: "error" });
  });
});
