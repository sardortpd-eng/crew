import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /route", () => {
  test("captures the whole prompt after /route", () => {
    expect(parseCommand("/route add a dark mode toggle")).toEqual({
      kind: "route",
      prompt: "add a dark mode toggle",
    });
  });

  test("an empty /route is a usage error", () => {
    expect(parseCommand("/route")).toMatchObject({ kind: "error" });
  });
});
