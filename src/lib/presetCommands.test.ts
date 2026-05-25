import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearCustomPresets, getPreset } from "../engine/presets.ts";
import type { PresetOp } from "./commands.ts";
import { handlePresetOp, loadStartupPresets } from "./presetCommands.ts";

let configDir: string;
let cwd: string;
const prevXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "crew-cfg-"));
  cwd = mkdtempSync(join(tmpdir(), "crew-cwd-"));
  process.env.XDG_CONFIG_HOME = configDir;
});

afterEach(() => {
  clearCustomPresets();
  rmSync(configDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
});

const newOp: PresetOp = {
  type: "new",
  name: "tester-z",
  model: "sonnet",
  mode: "acceptEdits",
  tools: ["Read", "Bash"],
  prompt: "You run the tests and fix failures.",
};

describe("handlePresetOp", () => {
  test("new creates, registers, and persists a preset", () => {
    const notice = handlePresetOp(newOp, cwd);

    expect(notice).toContain("Created");
    expect(getPreset("tester-z")?.model).toBe("sonnet");

    // A fresh load from disk (after clearing) finds the persisted preset.
    clearCustomPresets();
    expect(getPreset("tester-z")).toBeUndefined();
    loadStartupPresets(cwd);
    expect(getPreset("tester-z")?.allowedTools).toEqual(["Read", "Bash"]);
  });

  test("new rejects invalid input without persisting", () => {
    const notice = handlePresetOp({ ...newOp, mode: "turbo" }, cwd);
    expect(notice).toContain("Invalid preset");
    expect(getPreset("tester-z")).toBeUndefined();
  });

  test("new rejects a built-in name", () => {
    const notice = handlePresetOp({ ...newOp, name: "coder" }, cwd);
    expect(notice).toContain("built-in");
  });

  test("remove deletes a custom preset; refuses built-ins", () => {
    handlePresetOp(newOp, cwd);
    expect(handlePresetOp({ type: "remove", name: "tester-z" }, cwd)).toContain("Removed");
    expect(getPreset("tester-z")).toBeUndefined();
    expect(handlePresetOp({ type: "remove", name: "coder" }, cwd)).toContain("built-in");
  });

  test("list includes built-ins and marks customs", () => {
    handlePresetOp(newOp, cwd);
    const list = handlePresetOp({ type: "list" }, cwd);
    expect(list).toContain("coder");
    expect(list).toContain("tester-z *");
  });

  test("reload re-reads presets from disk", () => {
    handlePresetOp(newOp, cwd);
    clearCustomPresets();
    const notice = handlePresetOp({ type: "reload" }, cwd);
    expect(notice).toContain("Reloaded 1");
    expect(getPreset("tester-z")).toBeDefined();
  });
});
