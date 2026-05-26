import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /run", () => {
  test("plain /run has no mode (sequential)", () => {
    expect(parseCommand("/run")).toEqual({ kind: "run" });
  });

  test("/run parallel (and -p / p) selects parallel mode", () => {
    for (const raw of ["/run parallel", "/run -p", "/run p"]) {
      expect(parseCommand(raw)).toEqual({ kind: "run", mode: "parallel" });
    }
  });

  test("an unknown mode falls back to sequential", () => {
    expect(parseCommand("/run wat")).toEqual({ kind: "run" });
  });
});
