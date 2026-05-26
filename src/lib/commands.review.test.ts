import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /review", () => {
  test("parses an agent id or number", () => {
    expect(parseCommand("/review coder-1")).toEqual({ kind: "review", agent: "coder-1" });
    expect(parseCommand("/review 2")).toEqual({ kind: "review", agent: "2" });
  });

  test("requires an agent", () => {
    expect(parseCommand("/review").kind).toBe("error");
  });
});
