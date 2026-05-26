import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /budget", () => {
  test("bare /budget shows", () => {
    expect(parseCommand("/budget")).toEqual({ kind: "budget" });
  });

  test("a dollar amount sets the cap (with or without $)", () => {
    expect(parseCommand("/budget 0.50")).toEqual({ kind: "budget", usd: 0.5 });
    expect(parseCommand("/budget $2")).toEqual({ kind: "budget", usd: 2 });
  });

  test("off/none/0 clear the cap", () => {
    expect(parseCommand("/budget off")).toEqual({ kind: "budget", usd: null });
    expect(parseCommand("/budget 0")).toEqual({ kind: "budget", usd: null });
  });

  test("a non-number is a usage error", () => {
    expect(parseCommand("/budget lots")).toMatchObject({ kind: "error" });
    expect(parseCommand("/budget -1")).toMatchObject({ kind: "error" });
  });
});
