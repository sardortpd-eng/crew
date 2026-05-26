/**
 * End-to-end shakedown: drives crew's real engine (plan → route → build →
 * verify+auto-fix → checkpoint) against the live `claude` binary, building a
 * small multi-file project in a temp git repo. Reports what actually happened.
 *
 * Run: env -u ANTHROPIC_API_KEY bun run scripts/shakedown.ts
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Orchestrator } from "../src/engine/orchestrator.ts";
import { VerifyController } from "../src/engine/verifyController.ts";
import { CheckpointController } from "../src/engine/checkpointController.ts";
import { planGoal } from "../src/engine/planner.ts";
import { getPreset, listPresets } from "../src/engine/presets.ts";
import { isGreenfield } from "../src/lib/repoState.ts";

const GOAL =
  "Build a minimal Bun todo CLI in TypeScript: a `todo.ts` module exporting pure " +
  "addTodo/listTodos/completeTodo functions over an array, and a `todo.test.ts` using " +
  "`bun:test` that covers all three. Keep it small and make the tests pass.";
const MAX_TASKS = 4;

const dir = mkdtempSync(join(tmpdir(), "crew-shake-"));
let totalCost = 0;
const toolCounts = new Map<string, number>();

async function sh(cmd: string): Promise<{ code: number; out: string }> {
  const p = Bun.spawn(["sh", "-c", cmd], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code, out: out + err };
}

async function seed(): Promise<void> {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "todo", type: "module", scripts: { test: "bun test" } }, null, 2),
  );
  writeFileSync(join(dir, "bun.lock"), ""); // makes gate detection pick bun
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
  await sh("git init -q && git add -A && git commit -q -m base");
  await sh(
    "git config user.email t@t.t && git config user.name t && git config commit.gpgsign false",
  );
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("Re-run with `env -u ANTHROPIC_API_KEY`.");
    process.exit(1);
  }
  await seed();
  console.error(`\n=== crew shakedown ===\nrepo: ${dir}\ngoal: ${GOAL}\n`);

  const orchestrator = new Orchestrator({
    queryFn: query,
    cwd: dir,
    // Bound the run so a runaway can't burn the subscription.
    resolveBudget: () => ({ maxTurns: 30, maxBudgetUsd: 1.0 }),
  });
  const verifier = new VerifyController({
    cwd: dir,
    send: (id, prompt) => orchestrator.send(id, prompt),
    onState: (id, s) =>
      console.error(
        `  [verify:${id}] ${s.status}${s.gate ? ` (${s.gate})` : ""} ${s.attempt}/${s.maxAttempts}`,
      ),
  });
  const checkpoints = new CheckpointController({ cwd: dir });

  // 1. Plan. Mirror useCrew.plan(): compute greenfield so the seeded config-only
  // repo skips a wasteful codebase-exploration task.
  console.error("→ planning…");
  const greenfield = isGreenfield(readdirSync(dir));
  console.error(`  greenfield: ${greenfield}`);
  const tasks = (await planGoal(GOAL, listPresets(), { queryFn: query, greenfield })).slice(
    0,
    MAX_TASKS,
  );
  console.error(`→ plan (${tasks.length} tasks):`);
  for (const t of tasks) console.error(`    • [${t.preset}] ${t.title}`);
  console.error("");

  // 2. Run sequentially (reuse one agent per preset), verifying + checkpointing builders.
  const byPreset = new Map<string, string>();
  for (const [i, task] of tasks.entries()) {
    const preset = getPreset(task.preset) ?? getPreset("coder")!;
    let id = byPreset.get(preset.name);
    if (!id) {
      const agent = orchestrator.spawn(preset);
      id = agent.id;
      byPreset.set(preset.name, id);
      agent.session.on("status", (s) => process.stderr.write(`\r  [${id}] ${s}      `));
      agent.session.on("tool", (t) => toolCounts.set(id!, (toolCounts.get(id!) ?? 0) + 1));
      agent.session.on("usage", (u) => {
        totalCost += u.costUsd;
      });
      agent.session.on("error", (e) => console.error(`\n  [${id}] ERROR ${e.message}`));
    }
    console.error(`\n→ task ${i + 1}/${tasks.length} [${id}] ${task.title}`);
    await orchestrator.send(id, task.title);

    const builder = preset.permissionMode === "acceptEdits";
    if (builder) {
      verifier.enqueue(id);
      const t0 = Date.now();
      while (verifier.isVerifying(id) && Date.now() - t0 < 180_000) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const cp = await checkpoints.checkpoint(id, task.title);
      console.error(`  ${cp.message}`);
    }
  }

  // 3. Report.
  console.error("\n=== RESULT ===");
  const files = readdirSync(dir).filter((f) => !f.startsWith(".") && f !== "node_modules");
  console.error(`files: ${files.join(", ")}`);
  const test = await sh("bun test 2>&1");
  console.error(`\nfinal \`bun test\`: exit ${test.code}`);
  console.error(test.out.split("\n").slice(-12).join("\n"));
  const log = await sh("git log --oneline --all | head -10");
  console.error(`\ngit log:\n${log.out}`);
  console.error(
    `\ntotal cost: $${totalCost.toFixed(4)} · tools: ${[...toolCounts].map(([k, v]) => `${k}=${v}`).join(" ")}`,
  );
  console.error(test.code === 0 ? "\nSHAKEDOWN: tests green ✅" : "\nSHAKEDOWN: tests red ❌");

  rmSync(dir, { recursive: true, force: true });
  process.exit(test.code === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error("\nSHAKEDOWN CRASHED:", e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
