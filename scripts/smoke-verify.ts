/**
 * End-to-end check for the verify + auto-fix loop against the real binary.
 * Creates a temp repo with a deliberately wrong implementation + a bun test,
 * spawns a coder agent to "make the tests pass", then runs the VerifyController
 * and asserts it ends up green (auto-fixing if the agent's first pass missed).
 *
 * Run: env -u ANTHROPIC_API_KEY bun run scripts/smoke-verify.ts
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Orchestrator } from "../src/engine/orchestrator.ts";
import { getPreset } from "../src/engine/presets.ts";
import { VerifyController } from "../src/engine/verifyController.ts";
import type { VerifyState } from "../src/state/store.ts";

const dir = mkdtempSync(join(tmpdir(), "crew-verify-"));

function seedRepo(): void {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "tmp", type: "module", scripts: { test: "bun test" } }, null, 2),
  );
  writeFileSync(join(dir, "bun.lock"), ""); // make crew detect the bun package manager
  // Wrong on purpose: add() subtracts. The test expects addition.
  writeFileSync(join(dir, "math.ts"), "export const add = (a: number, b: number) => a - b;\n");
  writeFileSync(
    join(dir, "math.test.ts"),
    [
      'import { test, expect } from "bun:test";',
      'import { add } from "./math.ts";',
      'test("adds", () => { expect(add(2, 3)).toBe(5); });',
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("Re-run with `env -u ANTHROPIC_API_KEY`.");
    process.exit(1);
  }
  seedRepo();
  console.error(`[repo] ${dir}`);

  const orchestrator = new Orchestrator({ queryFn: query, cwd: dir });
  let last: VerifyState | undefined;
  const verifier = new VerifyController({
    cwd: dir,
    send: (id, prompt) => orchestrator.send(id, prompt),
    onState: (id, state) => {
      last = state;
      console.error(
        `[verify:${id}] ${state.status}${state.gate ? ` (${state.gate})` : ""} ${state.attempt}/${state.maxAttempts}`,
      );
    },
  });

  const preset = getPreset("coder")!;
  const agent = orchestrator.spawn(preset);
  agent.session.on("status", (s) => console.error(`[agent] ${s}`));

  // First turn: ask the agent to make the tests pass.
  await orchestrator.send(
    agent.id,
    "Run `bun test` and make the failing test pass by fixing the source. Keep changes minimal.",
  );

  // Now run the verify loop (auto-fix if still red).
  verifier.enqueue(agent.id);
  while (verifier.isVerifying(agent.id)) {
    await new Promise((r) => setTimeout(r, 200));
  }

  const passed = last?.status === "passed";
  console.error(`\nfinal verify: ${last?.status}`);
  console.error(passed ? "VERIFY SMOKE PASS ✅" : "VERIFY SMOKE FAIL ❌");
  rmSync(dir, { recursive: true, force: true });
  process.exit(passed ? 0 : 1);
}

void main().catch((e) => {
  console.error(e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
