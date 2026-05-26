/**
 * Paid end-to-end smoke for the lead agent: drives ONE real delegation in a
 * temp git repo. The lead plans, hires a coder via its `assign` tool, the coder
 * writes a tiny module + test, the lead verifies, and we assert the file exists
 * and `bun test` passes. Hard-bounded so a runaway can't burn the subscription.
 *
 * Run: env -u ANTHROPIC_API_KEY bun run scripts/smoke-lead-run.ts
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Orchestrator } from "../src/engine/orchestrator.ts";
import { getPreset } from "../src/engine/presets.ts";
import { createLeadServer } from "../src/engine/leadTools.ts";

const GOAL =
  "Create `sum.ts` exporting a pure `sum(a: number, b: number): number`, and `sum.test.ts` " +
  "using `bun:test` that covers it. Keep it tiny and make the test pass. Delegate the coding " +
  "to a specialist, then verify.";

const dir = mkdtempSync(join(tmpdir(), "crew-lead-run-"));
let totalCost = 0;
const lastResult = new Map<string, { text: string; errored: boolean }>();

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
    JSON.stringify({ name: "lead-run", type: "module", scripts: { test: "bun test" } }, null, 2),
  );
  writeFileSync(join(dir, "bun.lock"), "");
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
  console.error(`\n=== lead run smoke ===\nrepo: ${dir}\ngoal: ${GOAL}\n`);

  const orchestrator = new Orchestrator({
    queryFn: query,
    cwd: dir,
    resolveBudget: () => ({ maxTurns: 25, maxBudgetUsd: 1.0 }),
  });

  /** Spawn-or-reuse a specialist, run the task, capture its final output. */
  async function assign(args: { preset: string; task: string; agentId?: string }) {
    let id = args.agentId;
    if (!id || !orchestrator.get(id)) {
      const preset = getPreset(args.preset) ?? getPreset("coder");
      if (!preset) return { ok: false as const, error: `unknown preset ${args.preset}` };
      const agent = orchestrator.spawn(preset);
      id = agent.id;
      agent.session.on("result", (t) => lastResult.set(agent.id, { text: t, errored: false }));
      agent.session.on("error", (e) =>
        lastResult.set(agent.id, { text: e.message, errored: true }),
      );
      agent.session.on("usage", (u) => {
        totalCost += u.costUsd;
      });
      agent.session.on("status", (s) => process.stderr.write(`\r  [${agent.id}] ${s}        `));
    }
    console.error(`\n  → assign ${id}: ${args.task}`);
    await orchestrator.send(id, args.task).catch(() => undefined);
    const r = lastResult.get(id) ?? { text: "(no output)", errored: false };
    return { ok: true as const, agentId: id, result: r.text, errored: r.errored };
  }

  const server = createLeadServer({
    listTeam: () => ({
      presets: [{ name: "coder", description: "writes code" }],
      agents: orchestrator.list().map((a) => ({ id: a.id, preset: a.preset.name, status: "idle" })),
    }),
    assign,
    verify: async () => {
      const t = await sh("bun test 2>&1");
      return { status: t.code === 0 ? "passed" : "failed", gate: "test" };
    },
    review: async () => "skipped (smoke)",
  });
  orchestrator.setLeadServer(server);

  const lead = orchestrator.spawn(getPreset("lead") ?? getPreset("coder")!);
  lead.session.on("usage", (u) => {
    totalCost += u.costUsd;
  });
  lead.session.on("status", (s) => process.stderr.write(`\r[lead] ${s}        `));
  lead.session.on("error", (e) => console.error(`\n[lead] ERROR ${e.message}`));
  console.error("→ handing the goal to the lead…");
  await orchestrator.send(lead.id, GOAL).catch((e) => console.error("lead send failed:", e));

  console.error("\n\n=== RESULT ===");
  const hasFile = existsSync(join(dir, "sum.ts"));
  const test = await sh("bun test 2>&1");
  console.error(`sum.ts exists: ${hasFile}`);
  console.error(`bun test: exit ${test.code}`);
  console.error(test.out.split("\n").slice(-8).join("\n"));
  console.error(`\ntotal cost: $${totalCost.toFixed(4)}`);
  const ok = hasFile && test.code === 0;
  console.error(ok ? "\nLEAD RUN: delegated build is green ✅" : "\nLEAD RUN: failed ❌");

  rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

void main().catch((e) => {
  console.error("\nSMOKE CRASHED:", e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
