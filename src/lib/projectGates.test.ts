import { describe, expect, test } from "bun:test";
import { detectGates, type RepoSnapshot } from "./projectGates.ts";

const repo = (over: Partial<RepoSnapshot>): RepoSnapshot => ({
  packageJson: null,
  hasTsconfig: false,
  packageManager: "npm",
  ...over,
});

describe("detectGates", () => {
  test("orders gates cheap→expensive from package scripts", () => {
    const gates = detectGates(
      repo({
        packageManager: "pnpm",
        packageJson: {
          scripts: { build: "vite build", test: "vitest", lint: "eslint .", typecheck: "tsc" },
        },
      }),
    );
    expect(gates.map((g) => g.name)).toEqual(["typecheck", "lint", "test", "build"]);
    expect(gates[0]?.command).toBe("pnpm run typecheck");
  });

  test("falls back to bunx tsc when typecheck script is absent but tsconfig exists", () => {
    const gates = detectGates(
      repo({ packageManager: "bun", hasTsconfig: true, packageJson: { scripts: {} } }),
    );
    expect(gates).toEqual([
      { name: "typecheck", command: "bunx tsc --noEmit" },
      { name: "test", command: "bun test" },
    ]);
  });

  test("npm uses `npm run` and `npm exec --` forms", () => {
    const gates = detectGates(
      repo({
        packageManager: "npm",
        hasTsconfig: true,
        packageJson: { scripts: { test: "jest" } },
      }),
    );
    expect(gates).toContainEqual({ name: "typecheck", command: "npm exec -- tsc --noEmit" });
    expect(gates).toContainEqual({ name: "test", command: "npm run test" });
  });

  test("never invents a lint script; bun test only as a fallback", () => {
    const noScripts = detectGates(repo({ packageManager: "npm", packageJson: { scripts: {} } }));
    expect(noScripts).toEqual([]); // npm, no scripts, no tsconfig → nothing
    const bun = detectGates(repo({ packageManager: "bun", packageJson: { scripts: {} } }));
    expect(bun).toEqual([{ name: "test", command: "bun test" }]);
  });

  test("explicit test script wins over the bun fallback", () => {
    const gates = detectGates(
      repo({ packageManager: "bun", packageJson: { scripts: { test: "vitest run" } } }),
    );
    expect(gates).toEqual([{ name: "test", command: "bun run test" }]);
  });
});
