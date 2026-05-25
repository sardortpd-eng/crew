import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /verify", () => {
  test("bare /verify verifies the focused agent", () => {
    expect(parseCommand("/verify")).toEqual({ kind: "verify" });
  });

  test("on/off toggle auto-verify", () => {
    expect(parseCommand("/verify on")).toEqual({ kind: "verify", toggle: "on" });
    expect(parseCommand("/verify off")).toEqual({ kind: "verify", toggle: "off" });
  });

  test("an id verifies a specific agent", () => {
    expect(parseCommand("/verify coder-1")).toEqual({ kind: "verify", id: "coder-1" });
  });
});
