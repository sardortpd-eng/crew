import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: session", () => {
  test("/save and /forget", () => {
    expect(parseCommand("/save")).toEqual({ kind: "save" });
    expect(parseCommand("/forget")).toEqual({ kind: "forget" });
  });
});
