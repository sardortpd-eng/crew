/**
 * The single source of truth for what slash commands exist and what they do.
 * Both the `/help` text and the input autocomplete menu derive from this, so a
 * new command is described in exactly one place.
 *
 * This catalog is for *presentation* (help + suggestions). Parsing lives in
 * `commands.ts`; keep the two in sync when adding a command.
 */

/** One documented slash command. */
export type CommandSpec = {
  /** Canonical name, without the leading slash (e.g. "mode"). */
  readonly name: string;
  /** Argument hint shown after the name (e.g. "[opus|sonnet|haiku|default]"). */
  readonly args?: string;
  /** One-line description of what the command does. */
  readonly summary: string;
  /** Alternate names that also invoke it (e.g. "?" for help). */
  readonly aliases?: readonly string[];
};

export const COMMAND_CATALOG: readonly CommandSpec[] = [
  { name: "spawn", args: "<preset> [task]", summary: "Launch an agent; optionally give it a task" },
  { name: "broadcast", args: "<task>", summary: "Send the same task to every agent in parallel" },
  { name: "focus", args: "<id|number>", summary: "Switch the focused agent" },
  { name: "view", args: "[grid|focus]", summary: "Switch layout (also Ctrl+G)" },
  {
    name: "mode",
    args: "[normal|plan|auto-edit|bypass]",
    summary: "Set the safety mode (Shift+Tab cycles)",
  },
  {
    name: "model",
    args: "[opus|sonnet|haiku|default] [agentId]",
    summary: "Override the model for every agent, or one agent (default = per-preset)",
  },
  { name: "checkpoint", args: "[label]", summary: "Commit a git checkpoint now", aliases: ["cp"] },
  { name: "undo", summary: "Roll back the last checkpoint" },
  { name: "diff", summary: "Show the latest checkpoint's changed files" },
  { name: "budget", args: "[total] <usd|off>", summary: "Cap per-turn (or total) spend" },
  { name: "plan", args: "<goal>", summary: "Break a goal into an assigned task board" },
  {
    name: "lead",
    args: "<goal>",
    summary: "Hand a goal to the lead agent — it hires, delegates, reviews, and integrates",
  },
  {
    name: "run",
    args: "[parallel]",
    summary: "Run the task board (sequential, or `parallel` in isolated worktrees)",
  },
  { name: "tasks", summary: "Show the task board" },
  { name: "verify", args: "[id|on|off]", summary: "Run quality gates now, or toggle auto-verify" },
  { name: "route", args: "<prompt>", summary: "Force crew to auto-assign the best agent" },
  {
    name: "mcp",
    args: "[add <name> <cmd|url>]",
    summary: "Show MCP servers, or add one to .crew/mcp.json",
  },
  {
    name: "install",
    args: "<repo> [--global] | list | update [name]",
    summary: "Install / list / re-pull skills/commands/MCP from a git repo",
  },
  { name: "uninstall", args: "<name>", summary: "Remove an installed plugin" },
  {
    name: "worktrees",
    args: "[on|off|list|clean]",
    summary: "Isolate each builder in its own git worktree",
    aliases: ["wt"],
  },
  {
    name: "merge",
    args: "<agent>",
    summary: "Merge a builder's worktree branch back into the base",
  },
  { name: "ship", summary: "Run the configured deploy + health-check gate" },
  { name: "audit", summary: "Show the recent audit trail" },
  { name: "save", summary: "Save this crew session to disk" },
  { name: "forget", summary: "Clear the saved session for this folder" },
  { name: "preset", args: "[list|new|rm|reload]", summary: "List or manage agent presets" },
  { name: "stop", args: "[id]", summary: "Abort the focused agent's turn (or one by id)" },
  { name: "remove", args: "[id]", summary: "Stop and remove an agent", aliases: ["rm"] },
  { name: "help", summary: "Show this help", aliases: ["?"] },
  { name: "quit", summary: "Exit crew (also Ctrl+C)", aliases: ["exit", "q"] },
];

/** Finds a command by canonical name or any alias (case-insensitive). */
export function findCommand(token: string): CommandSpec | undefined {
  const t = token.toLowerCase();
  return COMMAND_CATALOG.find((c) => c.name === t || c.aliases?.includes(t));
}

/** "/name args" for a command (no trailing space). */
export function commandUsage(spec: CommandSpec): string {
  return spec.args ? `/${spec.name} ${spec.args}` : `/${spec.name}`;
}

/** Renders the full `/help` text: aligned usage column + summaries. */
export function buildHelpText(): string {
  const usages = COMMAND_CATALOG.map(commandUsage);
  const width = Math.min(Math.max(...usages.map((u) => u.length)), 34);
  const lines = COMMAND_CATALOG.map(
    (spec, i) => `${(usages[i] ?? "").padEnd(width)}  ${spec.summary}`,
  );
  lines.push(`${"<text>".padEnd(width)}  Message the focused agent (resumes its session)`);
  return lines.join("\n");
}
