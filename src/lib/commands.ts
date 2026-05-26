import type { SafetyMode } from "../state/store.ts";

/** A `/preset` sub-operation. Semantic validation happens in the handler. */
export type PresetOp =
  | { readonly type: "list" }
  | { readonly type: "reload" }
  | { readonly type: "remove"; readonly name: string }
  | {
      readonly type: "new";
      readonly name: string;
      readonly model: string;
      readonly mode: string;
      readonly tools: readonly string[];
      readonly prompt: string;
    };

/**
 * Parsed result of an input-bar line. Slash commands map to typed variants;
 * anything else is a plain message to the focused agent.
 */
export type Command =
  | { readonly kind: "spawn"; readonly preset: string; readonly task?: string }
  | { readonly kind: "broadcast"; readonly task: string }
  | { readonly kind: "stop"; readonly id?: string }
  | { readonly kind: "focus"; readonly target: string }
  | { readonly kind: "remove"; readonly id?: string }
  | { readonly kind: "preset"; readonly op: PresetOp }
  | { readonly kind: "view"; readonly mode?: "grid" | "focus" }
  | { readonly kind: "verify"; readonly toggle?: "on" | "off"; readonly id?: string }
  | { readonly kind: "route"; readonly prompt: string }
  | { readonly kind: "mcp" }
  | { readonly kind: "mode"; readonly mode?: SafetyMode }
  | { readonly kind: "checkpoint"; readonly label?: string }
  | { readonly kind: "undo" }
  | { readonly kind: "diff" }
  | { readonly kind: "budget"; readonly usd?: number | null }
  | { readonly kind: "plan"; readonly goal: string }
  | { readonly kind: "run" }
  | { readonly kind: "tasks" }
  | { readonly kind: "save" }
  | { readonly kind: "forget" }
  | { readonly kind: "audit" }
  | { readonly kind: "ship" }
  | { readonly kind: "worktrees"; readonly action?: "on" | "off" | "list" | "clean" }
  | { readonly kind: "help" }
  | { readonly kind: "quit" }
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "error"; readonly message: string };

/** Parses one raw input line into a {@link Command}. Never throws. */
export function parseCommand(raw: string): Command {
  const input = raw.trim();
  if (input.length === 0) return { kind: "message", text: "" };
  if (!input.startsWith("/")) return { kind: "message", text: input };

  const [name, ...rest] = input.slice(1).split(/\s+/);
  const args = rest.join(" ");

  switch (name) {
    case "spawn": {
      const [preset, ...taskParts] = rest;
      if (!preset) return { kind: "error", message: "Usage: /spawn <preset> [task]" };
      const task = taskParts.join(" ");
      return task ? { kind: "spawn", preset, task } : { kind: "spawn", preset };
    }
    case "broadcast":
      if (!args) return { kind: "error", message: "Usage: /broadcast <task>" };
      return { kind: "broadcast", task: args };
    case "stop":
      return rest[0] ? { kind: "stop", id: rest[0] } : { kind: "stop" };
    case "remove":
    case "rm":
      return rest[0] ? { kind: "remove", id: rest[0] } : { kind: "remove" };
    case "focus":
      if (!rest[0]) return { kind: "error", message: "Usage: /focus <id|number>" };
      return { kind: "focus", target: rest[0] };
    case "preset":
    case "presets":
      return parsePresetCommand(rest);
    case "view": {
      const mode = rest[0]?.toLowerCase();
      if (mode === "grid" || mode === "focus") return { kind: "view", mode };
      if (!mode) return { kind: "view" };
      return { kind: "error", message: "Usage: /view [grid|focus]" };
    }
    case "verify": {
      const arg = rest[0]?.toLowerCase();
      if (arg === "on" || arg === "off") return { kind: "verify", toggle: arg };
      if (arg) return { kind: "verify", id: rest[0] };
      return { kind: "verify" };
    }
    case "route":
      if (!args) return { kind: "error", message: "Usage: /route <prompt>" };
      return { kind: "route", prompt: args };
    case "mcp":
      return { kind: "mcp" };
    case "mode": {
      const arg = rest[0]?.toLowerCase();
      if (!arg) return { kind: "mode" }; // cycle
      const mode = parseSafetyMode(arg);
      if (!mode) {
        return { kind: "error", message: "Usage: /mode [normal|plan|auto-edit|bypass]" };
      }
      return { kind: "mode", mode };
    }
    case "checkpoint":
    case "cp":
      return args ? { kind: "checkpoint", label: args } : { kind: "checkpoint" };
    case "undo":
      return { kind: "undo" };
    case "diff":
      return { kind: "diff" };
    case "plan":
      if (!args) return { kind: "error", message: "Usage: /plan <goal>" };
      return { kind: "plan", goal: args };
    case "run":
      return { kind: "run" };
    case "tasks":
      return { kind: "tasks" };
    case "save":
      return { kind: "save" };
    case "forget":
      return { kind: "forget" };
    case "audit":
      return { kind: "audit" };
    case "ship":
      return { kind: "ship" };
    case "worktrees":
    case "wt": {
      const arg = rest[0]?.toLowerCase();
      if (arg === "on" || arg === "off" || arg === "list" || arg === "clean") {
        return { kind: "worktrees", action: arg };
      }
      if (arg) return { kind: "error", message: "Usage: /worktrees [on|off|list|clean]" };
      return { kind: "worktrees" };
    }
    case "budget": {
      const arg = rest[0]?.toLowerCase();
      if (!arg) return { kind: "budget" }; // show
      if (arg === "off" || arg === "none" || arg === "0") return { kind: "budget", usd: null };
      const usd = Number.parseFloat(arg.replace(/^\$/, ""));
      if (!Number.isFinite(usd) || usd <= 0) {
        return { kind: "error", message: "Usage: /budget <usd> | off" };
      }
      return { kind: "budget", usd };
    }
    case "help":
    case "?":
      return { kind: "help" };
    case "quit":
    case "exit":
    case "q":
      return { kind: "quit" };
    default:
      return { kind: "error", message: `Unknown command: /${name}` };
  }
}

/** Maps a `/mode` argument (with aliases) to a {@link SafetyMode}, or null. */
function parseSafetyMode(arg: string): SafetyMode | null {
  switch (arg) {
    case "normal":
    case "default":
      return "normal";
    case "plan":
      return "plan";
    case "auto-edit":
    case "auto":
    case "acceptedits":
    case "accept-edits":
      return "acceptEdits";
    case "bypass":
    case "yolo":
    case "bypasspermissions":
      return "bypassPermissions";
    default:
      return null;
  }
}

const PRESET_NEW_USAGE = "Usage: /preset new <name> <model> <mode> <tools,csv> <system prompt…>";

/** Parses the argument list following `/preset`. */
function parsePresetCommand(rest: string[]): Command {
  const sub = rest[0]?.toLowerCase();

  if (!sub || sub === "list" || sub === "ls") return { kind: "preset", op: { type: "list" } };
  if (sub === "reload") return { kind: "preset", op: { type: "reload" } };

  if (sub === "rm" || sub === "remove" || sub === "delete") {
    const name = rest[1];
    if (!name) return { kind: "error", message: "Usage: /preset rm <name>" };
    return { kind: "preset", op: { type: "remove", name } };
  }

  if (sub === "new" || sub === "add" || sub === "create") {
    const [, name, model, mode, toolsCsv, ...promptWords] = rest;
    if (!name || !model || !mode || !toolsCsv || promptWords.length === 0) {
      return { kind: "error", message: PRESET_NEW_USAGE };
    }
    const tools = toolsCsv
      .split(",")
      .map((tool) => tool.trim())
      .filter((tool) => tool.length > 0);
    return {
      kind: "preset",
      op: { type: "new", name, model, mode, tools, prompt: promptWords.join(" ") },
    };
  }

  return { kind: "error", message: `Unknown /preset subcommand: ${sub}` };
}

export const HELP_TEXT = [
  "/spawn <preset> [task]   spawn an agent (see /preset for the list)",
  "/broadcast <task>        send a task to every agent in parallel",
  "/focus <id|number>       focus an agent's pane",
  "/stop [id]               abort the focused agent (or by id)",
  "/remove [id]             stop and remove the focused agent (or by id)",
  "/preset                  list available presets",
  "/preset new <name> <model> <mode> <tools,csv> <prompt>   create a preset",
  "/preset rm <name>        remove a custom preset",
  "/preset reload           reload presets from config files",
  "/view [grid|focus]       switch layout (Ctrl+G toggles)",
  "/verify [id|on|off]      run quality gates now, or toggle auto-verify",
  "/route <prompt>          force crew to auto-assign an agent for a prompt",
  "/mcp                     show configured MCP servers + connection status",
  "/mode [normal|plan|auto-edit|bypass]   set the safety mode (Shift+Tab cycles)",
  "/checkpoint [label]      commit a git checkpoint now",
  "/undo                    roll back the last checkpoint",
  "/diff                    show the latest checkpoint's changed files",
  "/budget [usd|off]        cap per-turn spend (e.g. /budget 0.50)",
  "/plan <goal>             break a goal into an assigned task list",
  "/run                     run the task board sequentially",
  "/tasks                   show the task board",
  "/save                    save this crew session to disk",
  "/forget                  clear the saved session for this folder",
  "/audit                   show the recent audit trail",
  "/ship                    run the configured deploy + health-check gate",
  "/worktrees [on|off|list]  isolate each builder in its own git worktree",
  "/help                    show this help",
  "/quit                    exit crew",
  "<text>                   message the focused agent",
].join("\n");
