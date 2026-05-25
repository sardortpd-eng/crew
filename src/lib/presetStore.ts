import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isBuiltinName, type Preset, parsePreset } from "../engine/presets.ts";

/**
 * Where user-defined presets live. crew loads from the user config file and a
 * project-local `.crew/presets.json` (project entries win on name conflicts).
 * `/preset new` and `/preset rm` persist to the user config file.
 */
export function userPresetsPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "crew", "presets.json");
}

export function projectPresetsPath(cwd: string): string {
  return join(cwd, ".crew", "presets.json");
}

export type LoadResult = {
  readonly presets: readonly Preset[];
  readonly warnings: readonly string[];
};

/** Reads and validates custom presets from the user and project config files. */
export function loadCustomPresets(cwd: string): LoadResult {
  const warnings: string[] = [];
  const byName = new Map<string, Preset>();

  for (const path of [userPresetsPath(), projectPresetsPath(cwd)]) {
    for (const preset of readPresetFile(path, warnings)) byName.set(preset.name, preset);
  }

  return { presets: [...byName.values()], warnings };
}

/** Creates or replaces a preset in the user config file. */
export function persistPreset(preset: Preset): void {
  const path = userPresetsPath();
  const existing = readRawArray(path).filter((p) => nameOf(p) !== preset.name);
  writeArray(path, [...existing, preset]);
}

/** Removes a preset from the user config file. Returns true if it was present. */
export function removePersistedPreset(name: string): boolean {
  const path = userPresetsPath();
  const existing = readRawArray(path);
  const next = existing.filter((p) => nameOf(p) !== name);
  if (next.length === existing.length) return false;
  writeArray(path, next);
  return true;
}

function readPresetFile(path: string, warnings: string[]): Preset[] {
  const out: Preset[] = [];
  for (const raw of readRawArray(path)) {
    const result = parsePreset(raw);
    if (!result.ok) {
      warnings.push(`${path}: invalid preset (${result.error})`);
      continue;
    }
    if (isBuiltinName(result.preset.name)) {
      warnings.push(`${path}: "${result.preset.name}" shadows a built-in; skipped`);
      continue;
    }
    out.push(result.preset);
  }
  return out;
}

function readRawArray(path: string): unknown[] {
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(path: string, presets: readonly unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(presets, null, 2)}\n`, "utf8");
}

function nameOf(value: unknown): string | undefined {
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}
