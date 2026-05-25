import { describe, expect, test } from "bun:test";
import { getPreset, isBuilderPreset } from "../engine/presets.ts";
import { buildFixPrompt, type GateResult, nextAction } from "./verifyDecision.ts";

const ok = (name: string): GateResult => ({ name, passed: true, exitCode: 0, output: "" });
const fail = (name: string): GateResult => ({
  name,
  passed: false,
  exitCode: 1,
  output: `${name} broke`,
});

describe("nextAction", () => {
  test("all gates pass → pass", () => {
    expect(nextAction([ok("typecheck"), ok("test")], 1, 3)).toEqual({ kind: "pass" });
  });

  test("a failure with attempts left → fix on that gate", () => {
    const action = nextAction([ok("typecheck"), fail("test")], 1, 3);
    expect(action.kind).toBe("fix");
    if (action.kind === "fix") expect(action.gate.name).toBe("test");
  });

  test("a failure with no attempts left → giveup", () => {
    const action = nextAction([fail("test")], 3, 3);
    expect(action.kind).toBe("giveup");
  });
});

describe("buildFixPrompt", () => {
  test("names the gate and includes truncated output", () => {
    const prompt = buildFixPrompt({
      name: "test",
      passed: false,
      exitCode: 1,
      output: "expected 2 got 3",
    });
    expect(prompt).toContain('"test"');
    expect(prompt).toContain("expected 2 got 3");
    expect(prompt).toContain("keep the change minimal");
  });

  test("keeps only the tail of very long output", () => {
    const long = `${"x".repeat(5000)}TAIL`;
    const prompt = buildFixPrompt({ name: "build", passed: false, exitCode: 2, output: long });
    expect(prompt).toContain("TAIL");
    expect(prompt.length).toBeLessThan(2300);
  });
});

describe("isBuilderPreset", () => {
  test("coder/tester are builders; reviewer/explorer are not", () => {
    expect(isBuilderPreset(getPreset("coder")!)).toBe(true);
    expect(isBuilderPreset(getPreset("tester")!)).toBe(true);
    expect(isBuilderPreset(getPreset("reviewer")!)).toBe(false);
    expect(isBuilderPreset(getPreset("explorer")!)).toBe(false);
    expect(isBuilderPreset(getPreset("planner")!)).toBe(false);
  });
});
