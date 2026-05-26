import { describe, expect, test } from "bun:test";
import { isGreenfield } from "./repoState.ts";

describe("isGreenfield", () => {
  test("empty or config-only dirs are greenfield", () => {
    expect(isGreenfield([])).toBe(true);
    expect(isGreenfield([".git", "package.json", "bun.lock", "tsconfig.json", ".gitignore"])).toBe(
      true,
    );
    expect(isGreenfield(["package.json", "README.md", "node_modules"])).toBe(true);
  });

  test("one stray source file still counts as greenfield (≤1)", () => {
    expect(isGreenfield(["package.json", "index.ts"])).toBe(true);
  });

  test("a populated source tree is not greenfield", () => {
    expect(isGreenfield(["package.json", "index.ts", "app.ts", "util.ts"])).toBe(false);
    expect(isGreenfield(["src", "lib", "main.py"])).toBe(false);
  });
});
