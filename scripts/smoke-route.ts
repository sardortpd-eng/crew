/**
 * Exercises the prompt router against the real binary. Prints the chosen preset,
 * method (heuristic|llm|fallback), and reason for a handful of prompts.
 *
 * Run: env -u ANTHROPIC_API_KEY bun run scripts/smoke-route.ts
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { listPresets } from "../src/engine/presets.ts";
import { routePrompt } from "../src/engine/router.ts";

const PROMPTS = [
  "review the auth module for issues", // heuristic → reviewer
  "add a dark-mode toggle to settings", // heuristic → coder
  "the grid view flickers on resize", // ambiguous-ish → debugger / llm
  "make sure user input can't break things", // llm → security
  "help me understand how sessions resume", // explorer
];

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("Re-run with `env -u ANTHROPIC_API_KEY`.");
    process.exit(1);
  }
  const presets = listPresets();
  let ok = true;
  for (const prompt of PROMPTS) {
    const r = await routePrompt(prompt, presets, { queryFn: query });
    console.error(`• ${JSON.stringify(prompt)}\n    → ${r.preset}  [${r.method}]  ${r.reason}`);
    if (!presets.some((p) => p.preset.name === r.preset)) ok = false;
  }
  console.error(ok ? "\nROUTE SMOKE PASS ✅" : "\nROUTE SMOKE FAIL ❌");
  process.exit(ok ? 0 : 1);
}

void main();
