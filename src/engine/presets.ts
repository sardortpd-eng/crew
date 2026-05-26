import { z } from "zod";

/** Models a preset may target. */
export const PRESET_MODELS = ["opus", "sonnet", "haiku"] as const;

/** A model alias a preset (or a session-wide override) may target. */
export type PresetModel = (typeof PRESET_MODELS)[number];

/** Permission modes a preset may request. */
export const PRESET_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
  "delegate",
  "dontAsk",
] as const;

/** Schema for a preset. Used to validate both `/preset new` input and config files. */
export const presetSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits and hyphens"),
  description: z.string().min(1),
  model: z.enum(PRESET_MODELS),
  systemPrompt: z.string().min(1),
  allowedTools: z.array(z.string().min(1)),
  permissionMode: z.enum(PRESET_MODES),
});

/**
 * An immutable, named agent definition. Spawning clones a preset into a
 * runtime session config — presets themselves are never mutated.
 */
export type Preset = Readonly<Omit<z.infer<typeof presetSchema>, "allowedTools">> & {
  readonly allowedTools: readonly string[];
};

const BUILTINS: readonly Preset[] = [
  {
    name: "coder",
    description: "Writes and edits code; can read, edit, write files and run shell commands.",
    model: "sonnet",
    systemPrompt:
      "You are a focused coding agent. Make minimal, correct changes. " +
      "Prefer small diffs and explain what you changed in one or two sentences.",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "reviewer",
    description: "Read-only code reviewer; reports issues by severity, never edits.",
    model: "sonnet",
    systemPrompt:
      "You are a meticulous code reviewer. Inspect the code read-only and report " +
      "issues grouped by severity (CRITICAL/HIGH/MEDIUM/LOW). Do not modify files.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "default",
  },
  {
    name: "explorer",
    description: "Read-only codebase explorer; maps structure and finds relevant files.",
    model: "haiku",
    systemPrompt:
      "You are a codebase explorer. Quickly locate relevant files and summarize " +
      "structure and key entry points. Read-only; cite paths as file:line.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "default",
  },
  {
    name: "planner",
    description: "Read-only planner; produces step-by-step implementation plans.",
    model: "opus",
    systemPrompt:
      "You are an implementation planner. Read the relevant code, then produce a " +
      "concise, ordered plan with risks and dependencies. Do not write code.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "plan",
  },
  {
    name: "tester",
    description: "Writes and runs tests, then fixes failures.",
    model: "sonnet",
    systemPrompt:
      "You are a test engineer. Write tests that follow the project's existing " +
      "conventions, run them, and fix failures. Call out coverage gaps you find.",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "debugger",
    description: "Reproduces a bug, finds the root cause, and applies a minimal fix.",
    model: "sonnet",
    systemPrompt:
      "You are a debugger. Reproduce the issue, isolate the root cause, apply a " +
      "minimal fix, and verify it. Explain the root cause in one or two sentences.",
    allowedTools: ["Read", "Edit", "Bash", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "docs",
    description: "Writes and updates documentation to match the code.",
    model: "sonnet",
    systemPrompt:
      "You are a documentation writer. Produce clear, accurate docs that match the " +
      "code. Update READMEs and comments where it genuinely helps; avoid fluff.",
    allowedTools: ["Read", "Edit", "Write", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "security",
    description: "Read-only security auditor; reports vulnerabilities by severity.",
    model: "opus",
    systemPrompt:
      "You are a security auditor. Review code read-only for the OWASP Top 10, " +
      "leaked secrets, injection, and authorization flaws. Report findings by " +
      "severity with file:line references. Do not modify files.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "default",
  },
  {
    name: "refactorer",
    description: "Improves structure and readability while preserving behavior.",
    model: "sonnet",
    systemPrompt:
      "You are a refactoring specialist. Improve structure and readability while " +
      "preserving behavior. Make small, safe, well-explained changes.",
    allowedTools: ["Read", "Edit", "Write", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "architect",
    description: "Read-only architect; proposes design decisions with trade-offs.",
    model: "opus",
    systemPrompt:
      "You are a software architect. Read the system, then propose architecture and " +
      "design decisions with explicit trade-offs. Do not write code.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "plan",
  },
];

const registry = new Map<string, Preset>();
const customNames = new Set<string>();

for (const preset of BUILTINS) registry.set(preset.name, deepFreeze(preset));

/** A preset plus whether it ships built-in (vs. user-defined). */
export type PresetEntry = { readonly preset: Preset; readonly builtin: boolean };

/** Returns the preset for a name (case-insensitive), or undefined. */
export function getPreset(name: string): Preset | undefined {
  return registry.get(name.toLowerCase());
}

/** All available preset names. */
export function presetNames(): string[] {
  return [...registry.keys()];
}

/** All presets with their origin, built-ins first. */
export function listPresets(): PresetEntry[] {
  return [...registry.values()].map((preset) => ({
    preset,
    builtin: !customNames.has(preset.name),
  }));
}

/** True if the name is a built-in preset (which cannot be removed). */
export function isBuiltinName(name: string): boolean {
  const lower = name.toLowerCase();
  return registry.has(lower) && !customNames.has(lower);
}

/** Registers (or replaces) a custom preset. */
export function registerPreset(preset: Preset): void {
  registry.set(preset.name, deepFreeze(preset));
  customNames.add(preset.name);
}

/** Removes a custom preset. Returns false for unknown or built-in names. */
export function unregisterPreset(name: string): boolean {
  const lower = name.toLowerCase();
  if (!customNames.has(lower)) return false;
  registry.delete(lower);
  customNames.delete(lower);
  return true;
}

/** Drops all custom presets (built-ins remain). Used before a config reload. */
export function clearCustomPresets(): void {
  for (const name of customNames) registry.delete(name);
  customNames.clear();
}

/**
 * True for presets that edit code (auto-accept edits and can Write/Edit). Only
 * these trigger the verify + auto-fix loop; read-only presets never do.
 */
export function isBuilderPreset(preset: Preset): boolean {
  return (
    preset.permissionMode === "acceptEdits" &&
    preset.allowedTools.some((tool) => tool === "Write" || tool === "Edit")
  );
}

/** Validates unknown input into a Preset. */
export function parsePreset(
  input: unknown,
): { ok: true; preset: Preset } | { ok: false; error: string } {
  const result = presetSchema.safeParse(input);
  if (!result.success) {
    const error = result.error.issues
      .map((issue) => `${issue.path.join(".") || "preset"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error };
  }
  return { ok: true, preset: deepFreeze(result.data) };
}

function deepFreeze(preset: Preset): Preset {
  return Object.freeze({
    ...preset,
    allowedTools: Object.freeze([...preset.allowedTools]),
  });
}
