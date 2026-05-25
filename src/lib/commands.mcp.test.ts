import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /mcp", () => {
  test("parses /mcp", () => {
    expect(parseCommand("/mcp")).toEqual({ kind: "mcp" });
  });

  test("ignores trailing args", () => {
    expect(parseCommand("/mcp status")).toEqual({ kind: "mcp" });
  });
});
