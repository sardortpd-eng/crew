/**
 * Installs Claude plugins/skills/commands/MCP from a git repo into a per-scope
 * directory, and tracks them in a registry crew loads at startup. A repo is
 * treated as a local plugin (the SDK's plugin format is a superset), so one
 * installer covers every artifact kind.
 *
 * The git runner is injectable so the orchestration logic is unit-testable
 * without the network.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { InstallScope, InstallSource } from "./installSource.ts";
import { makeManifest, type PluginProbe, summarizePlugin } from "./pluginLayout.ts";

/** A registered, installed plugin directory. */
export type InstalledPlugin = {
  readonly name: string;
  /** Absolute path to the plugin directory the SDK loads. */
  readonly path: string;
  readonly url: string;
  readonly ref?: string;
  readonly scope: InstallScope;
  readonly components: readonly string[];
};

/** Runs `git <args>` in `cwd`. Injectable so tests avoid the network. */
export type GitRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<{ code: number; stderr: string }>;

export type InstallResult =
  | { readonly ok: true; readonly plugin: InstalledPlugin }
  | { readonly ok: false; readonly error: string };

const MAX_WALK_DEPTH = 4;

const entrySchema = z.object({
  name: z.string(),
  path: z.string(),
  url: z.string(),
  ref: z.string().optional(),
  components: z.array(z.string()).default([]),
});
const registrySchema = z.object({ plugins: z.array(entrySchema).default([]) });

/** Default runner backed by the real `git` binary. */
export const defaultGitRunner: GitRunner = async (args, cwd) => {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return { code, stderr };
};

function globalRoot(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "crew");
}

/** Directory installed plugins live under, per scope. */
export function installRoot(scope: InstallScope, cwd: string): string {
  return scope === "global" ? join(globalRoot(), "installed") : join(cwd, ".crew", "installed");
}

function registryPath(scope: InstallScope, cwd: string): string {
  return scope === "global"
    ? join(globalRoot(), "installed.json")
    : join(cwd, ".crew", "installed.json");
}

/**
 * Clones `source` into its scope's install dir and registers it. Cleans up a
 * partial clone on any failure. Never throws — returns a typed result.
 */
export async function installFromGit(
  source: InstallSource,
  opts: { cwd: string; git?: GitRunner },
): Promise<InstallResult> {
  const git = opts.git ?? defaultGitRunner;
  const root = installRoot(source.scope, opts.cwd);
  const dest = join(root, source.name);

  if (existsSync(dest)) {
    return { ok: false, error: `"${source.name}" is already installed — /uninstall it first.` };
  }
  mkdirSync(root, { recursive: true });

  const cloneArgs = ["clone", "--depth", "1"];
  if (source.ref) cloneArgs.push("--branch", source.ref);
  cloneArgs.push(source.url, dest);

  const cloned = await git(cloneArgs, root);
  if (cloned.code !== 0) {
    safeRemove(dest);
    return { ok: false, error: `git clone failed: ${firstLine(cloned.stderr) || "unknown error"}` };
  }

  const probe = probePlugin(dest);
  const summary = summarizePlugin(probe);
  if (summary.isEmpty) {
    safeRemove(dest);
    return {
      ok: false,
      error: "No commands, skills, agents, hooks, or MCP servers found in repo.",
    };
  }
  if (summary.needsManifest) writeManifest(dest, source.name);

  const plugin: InstalledPlugin = {
    name: source.name,
    path: dest,
    url: source.url,
    scope: source.scope,
    components: summary.components,
    ...(source.ref ? { ref: source.ref } : {}),
  };
  upsertRegistry(source.scope, opts.cwd, plugin);
  return { ok: true, plugin };
}

/** Removes an installed plugin (dir + registry entry) from whichever scope holds it. */
export function removeInstalled(
  name: string,
  cwd: string,
): { ok: true; scope: InstallScope } | { ok: false; error: string } {
  for (const scope of ["project", "global"] as const) {
    const entries = readRegistry(scope, cwd);
    const match = entries.find((p) => p.name === name);
    if (!match) continue;
    safeRemove(match.path);
    writeRegistry(
      scope,
      cwd,
      entries.filter((p) => p.name !== name),
    );
    return { ok: true, scope };
  }
  return { ok: false, error: `"${name}" is not installed.` };
}

/**
 * Every installed plugin across both scopes, pruning entries whose directory
 * has gone missing. Project entries win on name conflicts.
 */
export function listInstalled(cwd: string): InstalledPlugin[] {
  const byName = new Map<string, InstalledPlugin>();
  for (const scope of ["global", "project"] as const) {
    for (const p of readRegistry(scope, cwd)) {
      if (existsSync(p.path)) byName.set(p.name, p);
    }
  }
  return [...byName.values()];
}

/** Probes a directory for the Claude artifacts the SDK can load. */
export function probePlugin(dir: string): PluginProbe {
  return {
    hasManifest: existsSync(join(dir, ".claude-plugin", "plugin.json")),
    commands: countMarkdown(join(dir, "commands"), 0),
    agents: countMarkdown(join(dir, "agents"), 0),
    skills: countSkills(join(dir, "skills"), 0),
    hasMcp: existsSync(join(dir, ".mcp.json")),
    hasHooks: existsSync(join(dir, "hooks", "hooks.json")),
  };
}

function writeManifest(dir: string, name: string): void {
  const manifestDir = join(dir, ".claude-plugin");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "plugin.json"), makeManifest(name));
}

function readRegistry(scope: InstallScope, cwd: string): InstalledPlugin[] {
  const path = registryPath(scope, cwd);
  if (!existsSync(path)) return [];
  try {
    const parsed = registrySchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) return [];
    return parsed.data.plugins.map((p) => ({ ...p, scope }));
  } catch {
    return [];
  }
}

function writeRegistry(
  scope: InstallScope,
  cwd: string,
  plugins: readonly InstalledPlugin[],
): void {
  const path = registryPath(scope, cwd);
  mkdirSync(join(path, ".."), { recursive: true });
  const body = plugins.map(({ name, path: p, url, ref, components }) => ({
    name,
    path: p,
    url,
    components,
    ...(ref ? { ref } : {}),
  }));
  writeFileSync(path, `${JSON.stringify({ plugins: body }, null, 2)}\n`);
}

function upsertRegistry(scope: InstallScope, cwd: string, plugin: InstalledPlugin): void {
  const others = readRegistry(scope, cwd).filter((p) => p.name !== plugin.name);
  writeRegistry(scope, cwd, [...others, plugin]);
}

/** Counts `.md` files under `dir`, recursing a bounded depth. */
function countMarkdown(dir: string, depth: number): number {
  if (depth > MAX_WALK_DEPTH || !isDir(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (isDir(full)) count += countMarkdown(full, depth + 1);
    else if (entry.endsWith(".md")) count += 1;
  }
  return count;
}

/** Counts skill directories (those containing a `SKILL.md`), recursing bounded. */
function countSkills(dir: string, depth: number): number {
  if (depth > MAX_WALK_DEPTH || !isDir(dir)) return 0;
  let count = 0;
  if (existsSync(join(dir, "SKILL.md"))) count += 1;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (isDir(full)) count += countSkills(full, depth + 1);
  }
  return count;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safeRemove(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim() ?? ""
  );
}
