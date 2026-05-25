import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /view", () => {
  test("toggles with no argument", () => {
    expect(parseCommand("/view")).toEqual({ kind: "view" });
  });

  test("accepts grid and focus", () => {
    expect(parseCommand("/view grid")).toEqual({ kind: "view", mode: "grid" });
    expect(parseCommand("/view focus")).toEqual({ kind: "view", mode: "focus" });
  });

  test("rejects an unknown mode", () => {
    expect(parseCommand("/view sideways")).toMatchObject({ kind: "error" });
  });
});
