/**
 * Offline-ish smoke for `/install`: builds a tiny local plugin repo (a slash
 * command + a skill + an MCP server entry), installs it via crew's installer,
 * then starts a real `query()` with that plugin and inspects the `system/init`
 * message — which reports the commands, skills, and plugins the SDK actually
 * loaded. Aborts right after init, so it barely spends.
 *
 * Run: env -u ANTHROPIC_API_KEY bun run scripts/smoke-install.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { subscriptionEnv } from "../src/engine/env.ts";
import type { InstallSource } from "../src/lib/installSource.ts";
import { installFromGit } from "../src/lib/installStore.ts";

const work = mkdtempSync(join(tmpdir(), "crew-inst-smoke-work-"));
const remote = mkdtempSync(join(tmpdir(), "crew-inst-smoke-remote-"));

async function sh(cmd: string, cwd: string): Promise<void> {
  await Bun.spawn(["sh", "-c", cmd], { cwd }).exited;
}

/** A local git repo shaped like a Claude plugin (command + skill + MCP). */
async function seedRemote(): Promise<void> {
  mkdirSync(join(remote, "commands"), { recursive: true });
  mkdirSync(join(remote, "skills", "wave"), { recursive: true });
  writeFileSync(join(remote, "commands", "wave.md"), "---\ndescription: Wave hello\n---\nWave 👋");
  writeFileSync(
    join(remote, "skills", "wave", "SKILL.md"),
    "---\nname: wave\ndescription: Waves at people\n---\nSay hello with a wave.",
  );
  await sh(
    "git init -q && git add -A && git -c user.email=t@t.t -c user.name=t commit -q -m seed",
    remote,
  );
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("Re-run with `env -u ANTHROPIC_API_KEY`.");
    process.exit(1);
  }
  await seedRemote();
  await sh("git init -q", work);
  console.error(`\n=== /install smoke ===\nwork: ${work}\nremote: ${remote}\n`);

  // 1. Install the local repo as a plugin. (A real /install parses owner/repo
  // or a git URL; here we point straight at the local clone source.)
  const source: InstallSource = { url: remote, name: "wave-pack", scope: "project" };
  const result = await installFromGit(source, { cwd: work });
  if (!result.ok) throw new Error(`install failed: ${result.error}`);
  console.error(`→ installed "${result.plugin.name}": ${result.plugin.components.join(", ")}`);
  console.error(`  path: ${result.plugin.path}\n`);

  // 2. Start a real query with the plugin and read what the SDK loaded.
  console.error("→ launching agent to read its init manifest…");
  const controller = new AbortController();
  const iterator = query({
    prompt: "say hi",
    options: {
      plugins: [{ type: "local", path: result.plugin.path }],
      settingSources: ["project"],
      cwd: work,
      maxTurns: 1,
      abortController: controller,
      env: subscriptionEnv(),
    },
  });

  let init: { slash_commands?: string[]; skills?: string[]; plugins?: { name: string }[] } | null =
    null;
  for await (const message of iterator) {
    if (message.type === "system" && message.subtype === "init") {
      init = message as typeof init;
      controller.abort(); // we only needed the manifest
      break;
    }
  }

  // 3. Report.
  console.error("\n=== RESULT ===");
  if (!init) {
    console.error("no init message received ❌");
    cleanup();
    process.exit(1);
  }
  const commands = init.slash_commands ?? [];
  const skills = init.skills ?? [];
  const plugins = (init.plugins ?? []).map((p) => p.name);
  console.error(`slash_commands: ${commands.join(", ") || "(none)"}`);
  console.error(`skills:         ${skills.join(", ") || "(none)"}`);
  console.error(`plugins:        ${plugins.join(", ") || "(none)"}`);

  const sawPlugin = plugins.some((p) => p.includes(result.plugin.name));
  const sawCommand = commands.some((c) => c.includes("wave"));
  const sawSkill = skills.some((s) => s.includes("wave"));
  const ok = sawPlugin || sawCommand || sawSkill;
  console.error(
    `\nplugin loaded: ${sawPlugin} · command: ${sawCommand} · skill: ${sawSkill}\n` +
      (ok ? "INSTALL SMOKE: plugin surfaced to the agent ✅" : "INSTALL SMOKE: not loaded ❌"),
  );
  cleanup();
  process.exit(ok ? 0 : 1);
}

function cleanup(): void {
  rmSync(work, { recursive: true, force: true });
  rmSync(remote, { recursive: true, force: true });
}

void main().catch((e) => {
  console.error("\nSMOKE CRASHED:", e);
  cleanup();
  process.exit(1);
});
