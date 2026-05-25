import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /mode", () => {
  test("bare /mode cycles", () => {
    expect(parseCommand("/mode")).toEqual({ kind: "mode" });
  });

  test("named modes and aliases map correctly", () => {
    expect(parseCommand("/mode plan")).toEqual({ kind: "mode", mode: "plan" });
    expect(parseCommand("/mode auto-edit")).toEqual({ kind: "mode", mode: "acceptEdits" });
    expect(parseCommand("/mode bypass")).toEqual({ kind: "mode", mode: "bypassPermissions" });
    expect(parseCommand("/mode yolo")).toEqual({ kind: "mode", mode: "bypassPermissions" });
    expect(parseCommand("/mode normal")).toEqual({ kind: "mode", mode: "normal" });
  });

  test("an unknown mode is a usage error", () => {
    expect(parseCommand("/mode sketchy")).toMatchObject({ kind: "error" });
  });
});
