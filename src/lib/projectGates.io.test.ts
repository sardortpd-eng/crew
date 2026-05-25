import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager, loadGates, readRepoSnapshot } from "./projectGates.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crew-gates-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, content: string) => writeFileSync(join(dir, name), content);
const pkg = (obj: unknown) => write("package.json", JSON.stringify(obj));

describe("detectPackageManager", () => {
  test("reads the lockfile", () => {
    expect(detectPackageManager(dir)).toBe("npm");
    write("pnpm-lock.yaml", "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });

  test("bun lockfile wins", () => {
    write("bun.lock", "");
    expect(detectPackageManager(dir)).toBe("bun");
  });
});

describe("readRepoSnapshot", () => {
  test("captures scripts, tsconfig, and package manager", () => {
    pkg({ scripts: { test: "vitest" } });
    write("tsconfig.json", "{}");
    write("yarn.lock", "");
    const snap = readRepoSnapshot(dir);
    expect(snap.packageJson?.scripts?.test).toBe("vitest");
    expect(snap.hasTsconfig).toBe(true);
    expect(snap.packageManager).toBe("yarn");
  });

  test("tolerates a missing/invalid package.json", () => {
    write("package.json", "{ not json");
    expect(readRepoSnapshot(dir).packageJson).toBeNull();
  });
});

describe("loadGates", () => {
  test("auto-detects when there is no override", () => {
    pkg({ scripts: { test: "bun test", build: "tsc" } });
    write("bun.lock", "");
    const cfg = loadGates(dir);
    expect(cfg.autoVerify).toBe(true);
    expect(cfg.maxAttempts).toBe(3);
    expect(cfg.gates?.map((g) => g.name)).toEqual(["test", "build"]);
  });

  test(".crew/verify.json overrides detection and clamps attempts", () => {
    pkg({ scripts: { test: "bun test" } });
    mkdirSync(join(dir, ".crew"));
    write(
      ".crew/verify.json",
      JSON.stringify({
        autoVerify: false,
        maxAttempts: 99,
        gates: [{ name: "ci", command: "make ci" }],
      }),
    );
    const cfg = loadGates(dir);
    expect(cfg.autoVerify).toBe(false);
    expect(cfg.maxAttempts).toBe(10); // clamped
    expect(cfg.gates).toEqual([{ name: "ci", command: "make ci" }]);
  });

  test("an empty gates override falls back to detection", () => {
    pkg({ scripts: { test: "bun test" } });
    write("bun.lock", "");
    mkdirSync(join(dir, ".crew"));
    write(".crew/verify.json", JSON.stringify({ gates: [] }));
    expect(loadGates(dir).gates?.map((g) => g.name)).toEqual(["test"]);
  });
});
