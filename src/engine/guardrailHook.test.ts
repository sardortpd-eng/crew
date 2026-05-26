import { describe, expect, test } from "bun:test";
import { guardBashCommands } from "./guardrailHook.ts";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";

const ctx = { signal: new AbortController().signal };

function preToolUse(toolName: string, toolInput: unknown): HookInput {
  return {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "t1",
  } as unknown as HookInput;
}

describe("guardBashCommands hook", () => {
  test("denies a destructive Bash command with a reason", async () => {
    const out = (await guardBashCommands(
      preToolUse("Bash", { command: "rm -rf /" }),
      "t1",
      ctx,
    )) as {
      hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
    };
    expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput?.permissionDecisionReason).toContain("guardrail");
  });

  test("stays out of the way for safe Bash", async () => {
    const out = await guardBashCommands(preToolUse("Bash", { command: "bun test" }), "t1", ctx);
    expect(out).toEqual({});
  });

  test("ignores non-Bash tools", async () => {
    const out = await guardBashCommands(preToolUse("Edit", { file_path: "/x" }), "t1", ctx);
    expect(out).toEqual({});
  });
});
