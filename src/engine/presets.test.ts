import { afterEach, describe, expect, test } from "bun:test";
import {
  clearCustomPresets,
  getPreset,
  isBuiltinName,
  listPresets,
  parsePreset,
  presetNames,
  registerPreset,
  unregisterPreset,
} from "./presets.ts";

const validInput = {
  name: "tester-x",
  description: "runs tests",
  model: "sonnet",
  systemPrompt: "You run tests.",
  allowedTools: ["Read", "Bash"],
  permissionMode: "acceptEdits",
};

afterEach(() => clearCustomPresets());

describe("preset registry", () => {
  test("ships the expected built-ins", () => {
    const names = presetNames();
    for (const name of ["coder", "reviewer", "explorer", "planner", "tester", "security"]) {
      expect(names).toContain(name);
    }
  });

  test("getPreset is case-insensitive", () => {
    expect(getPreset("CODER")?.name).toBe("coder");
    expect(getPreset("nope")).toBeUndefined();
  });

  test("built-in presets are frozen and report as built-in", () => {
    const coder = getPreset("coder");
    expect(Object.isFrozen(coder)).toBe(true);
    expect(isBuiltinName("coder")).toBe(true);
    expect(isBuiltinName("tester-x")).toBe(false);
  });

  test("registerPreset adds a custom preset that getPreset can find", () => {
    const parsed = parsePreset(validInput);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    registerPreset(parsed.preset);

    expect(getPreset("tester-x")?.systemPrompt).toBe("You run tests.");
    expect(isBuiltinName("tester-x")).toBe(false);
    expect(listPresets().some((e) => !e.builtin && e.preset.name === "tester-x")).toBe(true);
  });

  test("unregisterPreset removes only custom presets", () => {
    registerPreset(parsePresetOrThrow(validInput));
    expect(unregisterPreset("tester-x")).toBe(true);
    expect(getPreset("tester-x")).toBeUndefined();
    expect(unregisterPreset("coder")).toBe(false); // built-in
    expect(getPreset("coder")).toBeDefined();
  });

  test("clearCustomPresets drops customs but keeps built-ins", () => {
    registerPreset(parsePresetOrThrow(validInput));
    clearCustomPresets();
    expect(getPreset("tester-x")).toBeUndefined();
    expect(getPreset("coder")).toBeDefined();
  });
});

describe("parsePreset validation", () => {
  test("rejects a bad model", () => {
    const result = parsePreset({ ...validInput, model: "gpt" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("model");
  });

  test("rejects an invalid name", () => {
    const result = parsePreset({ ...validInput, name: "Bad Name" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("name");
  });

  test("rejects an empty system prompt", () => {
    const result = parsePreset({ ...validInput, systemPrompt: "" });
    expect(result.ok).toBe(false);
  });

  test("freezes the parsed preset and its tools", () => {
    const result = parsePreset(validInput);
    if (!result.ok) throw new Error("expected ok");
    expect(Object.isFrozen(result.preset)).toBe(true);
    expect(Object.isFrozen(result.preset.allowedTools)).toBe(true);
  });
});

function parsePresetOrThrow(input: unknown) {
  const result = parsePreset(input);
  if (!result.ok) throw new Error(result.error);
  return result.preset;
}
