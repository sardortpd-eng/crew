import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { checkCommand } from "../lib/guardrails.ts";
import type { Options } from "./types.ts";

/**
 * A `PreToolUse` hook that blocks destructive `Bash` commands. It runs before
 * tool execution regardless of permission mode — so it's a safety net even in
 * `bypass` mode, where the normal approval prompt is skipped.
 */
export const guardBashCommands: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse" || input.tool_name !== "Bash") return {};
  const command = (input.tool_input as { command?: unknown }).command;
  if (typeof command !== "string") return {};

  const reason = checkCommand(command);
  if (!reason) return {};

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Blocked by crew guardrail: ${reason}.`,
    },
  };
};

/** Hook config passed to every agent's query options. */
export function createGuardrailHooks(): Options["hooks"] {
  return { PreToolUse: [{ hooks: [guardBashCommands] }] };
}
