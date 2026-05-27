import { PRESET_MODELS, type PresetModel } from "../engine/presets.ts";
import type { SafetyMode } from "../state/store.ts";
import { type CheckpointMode, isCheckpointMode } from "./checkpointMode.ts";
import { buildHelpText } from "./commandCatalog.ts";

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
  | {
      readonly kind: "mcp";
      readonly op?: {
        readonly type: "add";
        readonly name: string;
        readonly spec: readonly string[];
      };
    }
  | {
      readonly kind: "install";
      readonly op:
        | { readonly type: "add"; readonly arg: string }
        | { readonly type: "list" }
        | { readonly type: "update"; readonly name?: string };
    }
  | { readonly kind: "uninstall"; readonly name: string }
  | { readonly kind: "mode"; readonly mode?: SafetyMode }
  | {
      readonly kind: "model";
      readonly choice?: PresetModel | "default";
      readonly agentId?: string;
    }
  | { readonly kind: "checkpoint"; readonly label?: string; readonly mode?: CheckpointMode }
  | { readonly kind: "undo" }
  | { readonly kind: "diff" }
  | { readonly kind: "budget"; readonly scope?: "turn" | "session"; readonly usd?: number | null }
  | { readonly kind: "plan"; readonly goal: string }
  | { readonly kind: "lead"; readonly goal: string }
  | { readonly kind: "run"; readonly mode?: "parallel" }
  | { readonly kind: "tasks" }
  | { readonly kind: "save" }
  | { readonly kind: "forget" }
  | { readonly kind: "audit" }
  | { readonly kind: "ship" }
  | { readonly kind: "worktrees"; readonly action?: "on" | "off" | "list" | "clean" }
  | { readonly kind: "merge"; readonly agent: string }
  | { readonly kind: "review"; readonly agent: string }
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
    case "mcp": {
      if (rest[0]?.toLowerCase() !== "add") return { kind: "mcp" };
      const [, name, ...spec] = rest;
      if (!name || spec.length === 0) {
        return { kind: "error", message: "Usage: /mcp add <name> <command [args…] | url>" };
      }
      return { kind: "mcp", op: { type: "add", name, spec } };
    }
    case "install": {
      const sub = rest[0]?.toLowerCase();
      if (sub === "list" || sub === "ls") return { kind: "install", op: { type: "list" } };
      if (sub === "update" || sub === "upgrade") {
        return { kind: "install", op: { type: "update", ...(rest[1] ? { name: rest[1] } : {}) } };
      }
      if (!args) {
        return {
          kind: "error",
          message: "Usage: /install <owner/repo | git-url> [--global]  ·  /install list",
        };
      }
      return { kind: "install", op: { type: "add", arg: args } };
    }
    case "uninstall": {
      const name = rest[0];
      if (!name) return { kind: "error", message: "Usage: /uninstall <name>" };
      return { kind: "uninstall", name };
    }
    case "model": {
      const arg = rest[0]?.toLowerCase();
      if (!arg) return { kind: "model" }; // show current
      const target = rest[1] ? { agentId: rest[1] } : {}; // optional agent (keep case for id match)
      if (arg === "default" || arg === "reset" || arg === "off") {
        return { kind: "model", choice: "default", ...target };
      }
      if ((PRESET_MODELS as readonly string[]).includes(arg)) {
        return { kind: "model", choice: arg as PresetModel, ...target };
      }
      return { kind: "error", message: "Usage: /model [opus|sonnet|haiku|default] [agentId]" };
    }
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
    case "cp": {
      const first = rest[0]?.toLowerCase();
      if (first && isCheckpointMode(first)) return { kind: "checkpoint", mode: first };
      return args ? { kind: "checkpoint", label: args } : { kind: "checkpoint" };
    }
    case "undo":
      return { kind: "undo" };
    case "diff":
      return { kind: "diff" };
    case "plan":
      if (!args) return { kind: "error", message: "Usage: /plan <goal>" };
      return { kind: "plan", goal: args };
    case "lead":
      if (!args) return { kind: "error", message: "Usage: /lead <goal>" };
      return { kind: "lead", goal: args };
    case "run": {
      const mode = rest[0]?.toLowerCase();
      if (mode === "parallel" || mode === "-p" || mode === "p")
        return { kind: "run", mode: "parallel" };
      return { kind: "run" };
    }
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
    case "merge":
      if (!rest[0]) return { kind: "error", message: "Usage: /merge <agent id|number>" };
      return { kind: "merge", agent: rest[0] };
    case "review":
      if (!rest[0]) return { kind: "error", message: "Usage: /review <agent id|number>" };
      return { kind: "review", agent: rest[0] };
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
      // `/budget total <usd>` = cumulative session cap; `/budget <usd>` = per-turn.
      const session = rest[0]?.toLowerCase() === "total";
      const scope = session ? "session" : "turn";
      const valueArg = (session ? rest[1] : rest[0])?.toLowerCase();
      if (!valueArg) return { kind: "budget", scope };
      if (valueArg === "off" || valueArg === "none" || valueArg === "0") {
        return { kind: "budget", scope, usd: null };
      }
      const usd = Number.parseFloat(valueArg.replace(/^\$/, ""));
      if (!Number.isFinite(usd) || usd <= 0) {
        return { kind: "error", message: "Usage: /budget [total] <usd> | off" };
      }
      return { kind: "budget", scope, usd };
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

/** Help text rendered for `/help`, derived from the command catalog. */
export const HELP_TEXT = buildHelpText();
