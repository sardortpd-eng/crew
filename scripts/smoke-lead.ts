/**
 * Cheap wiring check for the lead agent: boots a real `query()` with the lead
 * preset + its in-process crew-control MCP server, and confirms the SDK loaded
 * the server and exposed the assign/list_team/verify tools to the agent.
 * Aborts at the init message, so it doesn't pay for a turn.
 *
 * Run: env -u ANTHROPIC_API_KEY bun run scripts/smoke-lead.ts
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { subscriptionEnv } from "../src/engine/env.ts";
import { createLeadServer } from "../src/engine/leadTools.ts";
import { getPreset } from "../src/engine/presets.ts";

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("Re-run with `env -u ANTHROPIC_API_KEY`.");
    process.exit(1);
  }

  const lead = getPreset("lead");
  if (!lead) throw new Error("lead preset missing");

  const server = createLeadServer({
    listTeam: () => ({ presets: [{ name: "coder", description: "writes code" }], agents: [] }),
    assign: async () => ({ ok: true, agentId: "coder-1", result: "ok", errored: false }),
    verify: async () => ({ status: "passed" }),
    review: async () => "approve",
  });

  console.error("\n=== lead wiring smoke ===\n→ booting the lead agent…");
  const controller = new AbortController();
  const iterator = query({
    prompt: "Say READY and stop.",
    options: {
      model: lead.model,
      systemPrompt: lead.systemPrompt,
      allowedTools: [...lead.allowedTools],
      mcpServers: { crew: server },
      maxTurns: 1,
      abortController: controller,
      env: { ...subscriptionEnv(), CLAUDE_CODE_STREAM_CLOSE_TIMEOUT: "600000" },
    },
  });

  let init: { tools?: string[]; mcp_servers?: { name: string; status: string }[] } | null = null;
  for await (const message of iterator) {
    if (message.type === "system" && message.subtype === "init") {
      init = message as typeof init;
      controller.abort();
      break;
    }
  }

  console.error("\n=== RESULT ===");
  if (!init) {
    console.error("no init message ❌");
    process.exit(1);
  }
  const tools = init.tools ?? [];
  const crewServer = (init.mcp_servers ?? []).find((s) => s.name === "crew");
  const crewTools = tools.filter((t) => t.startsWith("mcp__crew__"));
  console.error(`crew MCP server: ${crewServer ? crewServer.status : "(absent)"}`);
  console.error(`crew tools exposed: ${crewTools.join(", ") || "(none)"}`);

  const ok =
    crewTools.includes("mcp__crew__assign") &&
    crewTools.includes("mcp__crew__list_team") &&
    crewTools.includes("mcp__crew__verify");
  console.error(ok ? "\nLEAD SMOKE: control tools wired ✅" : "\nLEAD SMOKE: tools missing ❌");
  process.exit(ok ? 0 : 1);
}

void main().catch((e) => {
  console.error("\nSMOKE CRASHED:", e);
  process.exit(1);
});
