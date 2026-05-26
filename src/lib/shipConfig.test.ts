import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadShipConfig } from "./projectGates.ts";
import { parseCommand } from "./commands.ts";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "crew-ship-"));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function writeVerify(obj: unknown) {
  mkdirSync(join(cwd, ".crew"), { recursive: true });
  writeFileSync(join(cwd, ".crew", "verify.json"), JSON.stringify(obj));
}

describe("loadShipConfig", () => {
  test("empty when no config", () => {
    expect(loadShipConfig(cwd)).toEqual({ deploy: undefined, health: undefined });
  });

  test("reads deploy + health strings", () => {
    writeVerify({ deploy: "vercel deploy", health: "curl -fsS localhost/health" });
    expect(loadShipConfig(cwd)).toEqual({
      deploy: "vercel deploy",
      health: "curl -fsS localhost/health",
    });
  });

  test("ignores non-string values", () => {
    writeVerify({ deploy: 123 });
    expect(loadShipConfig(cwd).deploy).toBeUndefined();
  });
});

describe("parseCommand: /audit, /ship", () => {
  test("parses both", () => {
    expect(parseCommand("/audit")).toEqual({ kind: "audit" });
    expect(parseCommand("/ship")).toEqual({ kind: "ship" });
  });
});
