import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /merge", () => {
  test("parses an agent id or number", () => {
    expect(parseCommand("/merge coder-1")).toEqual({ kind: "merge", agent: "coder-1" });
    expect(parseCommand("/merge 2")).toEqual({ kind: "merge", agent: "2" });
  });

  test("requires an agent", () => {
    expect(parseCommand("/merge").kind).toBe("error");
  });
});
