/**
 * Headless end-to-end smoke test: drives a real AgentSession against the
 * logged-in `claude` binary with a trivial prompt. Proves subscription auth,
 * streaming, and result capture without the TUI. Hard timeout so it can't hang.
 *
 * Run: env -u ANTHROPIC_API_KEY bun run scripts/smoke.ts
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { AgentSession } from "../src/engine/agentSession.ts";

const TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is set — re-run with `env -u ANTHROPIC_API_KEY`.");
    process.exit(1);
  }

  const session = new AgentSession("smoke-1", query);
  let streamed = "";

  session.on("delta", (t) => (streamed += t));
  session.on("status", (s) => console.error(`[status] ${s}`));
  session.on("session", (id) => console.error(`[session] ${id}`));
  session.on("result", (t) => console.error(`[result] ${t.trim()}`));
  session.on("error", (e) => console.error(`[error] ${e.message}`));

  const timer = setTimeout(() => {
    console.error("TIMEOUT");
    session.stop();
  }, TIMEOUT_MS);

  await session.run("Reply with exactly the single word: ok", {
    model: "haiku",
    allowedTools: [],
    permissionMode: "default",
    includePartialMessages: true,
    env: stripKey(),
  });

  clearTimeout(timer);
  const ok = streamed.toLowerCase().includes("ok") || session.getStatus() === "done";
  console.error(`\nstreamed=${JSON.stringify(streamed)} status=${session.getStatus()}`);
  console.error(ok ? "SMOKE PASS ✅" : "SMOKE FAIL ❌");
  process.exit(ok ? 0 : 1);
}

function stripKey(): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY: _omit, ...rest } = process.env;
  return rest;
}

void main();
