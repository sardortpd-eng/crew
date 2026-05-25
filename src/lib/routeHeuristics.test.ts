import { describe, expect, test } from "bun:test";
import { heuristicRoute } from "./routeHeuristics.ts";

const ALL = [
  "coder",
  "reviewer",
  "explorer",
  "planner",
  "tester",
  "debugger",
  "docs",
  "security",
  "refactorer",
  "architect",
];

describe("heuristicRoute", () => {
  test.each([
    ["review the auth module", "reviewer"],
    ["write unit tests for the router", "tester"],
    ["the grid flickers, debug it", "debugger"],
    ["add a dark-mode toggle", "coder"],
    ["refactor the store into smaller files", "refactorer"],
    ["where is the permission handler", "explorer"],
    ["plan the migration to v2", "planner"],
    ["audit for SQL injection and XSS", "security"],
    ["write the README for this package", "docs"],
    ["design the architecture for billing", "architect"],
  ])("routes %j → %s", (prompt, expected) => {
    expect(heuristicRoute(prompt, ALL)?.preset).toBe(expected);
  });

  test("returns null when nothing matches", () => {
    expect(heuristicRoute("hmm what about that thing", ALL)).toBeNull();
  });

  test("returns null on a tie (defers to the LLM)", () => {
    // "review" (reviewer) + "test" (tester) both score 1 → ambiguous.
    expect(heuristicRoute("review the test", ALL)).toBeNull();
  });

  test("never returns a preset that isn't available", () => {
    // reviewer not installed → a review prompt can't resolve heuristically.
    const without = ALL.filter((p) => p !== "reviewer");
    expect(heuristicRoute("please review this", without)).toBeNull();
  });
});
