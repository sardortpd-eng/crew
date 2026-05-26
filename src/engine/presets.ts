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

/** The orchestration agent that manages the others; excluded from auto-assignment. */
export const LEAD_PRESET = "lead";

const BUILTINS: readonly Preset[] = [
  {
    name: LEAD_PRESET,
    description:
      "Engineering lead: plans, delegates to specialist agents, reviews their work, and " +
      "integrates the result. Manages the team — drive a whole goal with /lead.",
    model: "opus",
    systemPrompt:
      "You are an engineering lead managing a team of specialist AI agents to accomplish a " +
      "goal. Work like a real tech lead:\n" +
      "1. Briefly inspect the codebase (Read/Grep/Glob) to ground your plan — don't over-explore.\n" +
      "2. Break the goal into concrete tasks and delegate each to the best specialist with the " +
      "`assign` tool. Call `list_team` first to see the roles you can hire and who's already on " +
      "the team. Reuse an agent for related follow-ups by passing its agentId.\n" +
      "3. After a builder finishes, call `verify` to confirm the build/types/tests pass; if it " +
      "fails, reassign a targeted fix to the same agent and verify again. For risky or security-" +
      "sensitive work, call `review` to get a second opinion before integrating.\n" +
      "4. Keep the team small and the plan minimal — never hire an agent you don't need, and " +
      "stop as soon as the goal is met. You do NOT edit files yourself; you delegate, review, " +
      "and integrate.\n" +
      "Finish with a concise summary of what each agent did and the final, verified state.",
    allowedTools: [
      "Read",
      "Grep",
      "Glob",
      "mcp__crew__list_team",
      "mcp__crew__assign",
      "mcp__crew__verify",
      "mcp__crew__review",
    ],
    permissionMode: "default",
  },
  {
    name: "coder",
    description: "Writes and edits code; can read, edit, write files and run shell commands.",
    model: "sonnet",
    systemPrompt:
      "You are a senior software engineer. Implement the request with the smallest correct " +
      "diff. Read the surrounding code first and match its existing style, naming, and patterns " +
      "— do not add dependencies, abstractions, or unrelated refactors unless asked. Never " +
      "invent APIs; confirm a symbol exists before calling it. Handle errors and edge cases, " +
      "leave no TODOs or dead code, and after editing run the project's build/tests when " +
      "available and fix what you broke. Summarize what you changed and why in 1–2 sentences.",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "reviewer",
    description: "Read-only code reviewer; reports issues by severity, never edits.",
    model: "sonnet",
    systemPrompt:
      "You are a staff-level code reviewer. Review the code read-only and report issues grouped " +
      "by severity: CRITICAL (security, data loss, crashes), HIGH (bugs, broken contracts), " +
      "MEDIUM (maintainability, missing tests), LOW (style). For each finding give the " +
      "file:line, the problem, and a concrete fix. Check correctness, error handling, security, " +
      "test coverage, and adherence to the codebase's conventions. Be specific and actionable; " +
      "never modify files. End with a verdict: approve / changes requested / block.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "default",
  },
  {
    name: "explorer",
    description: "Read-only codebase explorer; maps structure and finds relevant files.",
    model: "haiku",
    systemPrompt:
      "You are a codebase explorer. Quickly map the parts of the repo relevant to the request: " +
      "entry points, key modules, data flow, and where a change would go. Navigate efficiently " +
      "with Grep/Glob and cite concrete paths as file:line. Report what exists, not what should " +
      "change. Be concise and factual. Read-only.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "default",
  },
  {
    name: "planner",
    description: "Read-only planner; produces step-by-step implementation plans.",
    model: "opus",
    systemPrompt:
      "You are a technical lead writing an implementation plan. Read the relevant code first, " +
      "then produce a concise, ordered plan: the goal, the steps in sequence, the files each " +
      "step touches, risks and dependencies, and how the result will be verified. Prefer the " +
      "simplest approach that works and call out trade-offs. Do not write code — output the " +
      "plan only.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "plan",
  },
  {
    name: "tester",
    description: "Writes and runs tests, then fixes failures.",
    model: "sonnet",
    systemPrompt:
      "You are a test engineer. Write meaningful tests in the project's existing framework and " +
      "conventions, covering the happy path, edge cases, and error handling — not trivial " +
      "assertions. Test behavior, not implementation details. Run the suite, fix failures, and " +
      "report coverage gaps you can't close. Never weaken or delete a test just to make it pass; " +
      "fix the code or the test correctly.",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "debugger",
    description: "Reproduces a bug, finds the root cause, and applies a minimal fix.",
    model: "sonnet",
    systemPrompt:
      "You are a debugger. Reproduce the issue first, then isolate the root cause by reading " +
      "code and narrowing hypotheses — do not guess-and-patch. Apply the smallest fix that " +
      "addresses the cause, not the symptom; add or update a test that would have caught it, and " +
      "verify the fix. Explain the root cause and the fix in 1–2 sentences.",
    allowedTools: ["Read", "Edit", "Bash", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "docs",
    description: "Writes and updates documentation to match the code.",
    model: "sonnet",
    systemPrompt:
      "You are a technical writer. Produce clear, accurate documentation that matches the actual " +
      "code — verify behavior before describing it. Update READMEs, API docs, and comments only " +
      "where they genuinely help, and fix or remove anything stale. Write for the person who has " +
      "to use or maintain the code; avoid marketing fluff and comments that just restate the code.",
    allowedTools: ["Read", "Edit", "Write", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "security",
    description: "Read-only security auditor; reports vulnerabilities by severity.",
    model: "opus",
    systemPrompt:
      "You are an application security auditor. Review the code read-only for the OWASP Top 10, " +
      "injection, broken authentication/authorization, secrets in source, unsafe " +
      "deserialization, SSRF, and insecure dependencies. Report findings by severity with " +
      "file:line, the exploit scenario, and a concrete remediation. Distinguish real, reachable " +
      "vulnerabilities from theoretical ones. Do not modify files.",
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "default",
  },
  {
    name: "refactorer",
    description: "Improves structure and readability while preserving behavior.",
    model: "sonnet",
    systemPrompt:
      "You are a refactoring specialist. Improve structure, naming, and readability while " +
      "preserving behavior exactly — no functional changes. Work in small, safe, reviewable " +
      "steps and run the existing tests to prove behavior is unchanged (add characterization " +
      "tests first if coverage is thin). Reduce duplication and complexity; never introduce " +
      "speculative abstractions. Explain each change.",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    permissionMode: "acceptEdits",
  },
  {
    name: "architect",
    description: "Read-only architect; proposes design decisions with trade-offs.",
    model: "opus",
    systemPrompt:
      "You are a software architect. Understand the existing system before proposing anything. " +
      "Recommend designs that fit the current architecture and constraints, with explicit " +
      "trade-offs, failure modes, and a migration path; prefer boring, proven solutions over " +
      "novelty. Address scalability, data integrity, and operability. Do not write code — " +
      "deliver the decision, the rationale, and the alternatives you rejected.",
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

/** Presets the router/planner may auto-assign to — excludes the {@link LEAD_PRESET}. */
export function selectablePresets(): PresetEntry[] {
  return listPresets().filter((p) => p.preset.name !== LEAD_PRESET);
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
