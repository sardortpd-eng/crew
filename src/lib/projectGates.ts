import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A single quality gate: a named command to run in the project. */
export type Gate = { readonly name: string; readonly command: string };

/** What the detector needs to know about a repo (kept pure/injectable). */
export type RepoSnapshot = {
  readonly packageJson: PackageJson | null;
  readonly hasTsconfig: boolean;
  readonly packageManager: PackageManager;
};

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

type PackageJson = { scripts?: Record<string, string> };

/** Per-project verify config; overrides detection when present. */
export type GateConfig = {
  readonly autoVerify: boolean;
  readonly maxAttempts: number;
  readonly gates: readonly Gate[] | null;
};

export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Detects quality gates from a repo snapshot, ordered cheap→expensive so the
 * loop fails fast: typecheck → lint → test → build. Returns only gates that
 * actually apply (never invents a script that isn't there).
 */
export function detectGates(repo: RepoSnapshot): Gate[] {
  const scripts = repo.packageJson?.scripts ?? {};
  const pm = repo.packageManager;
  const gates: Gate[] = [];

  if (scripts.typecheck) gates.push({ name: "typecheck", command: runScript(pm, "typecheck") });
  else if (repo.hasTsconfig)
    gates.push({ name: "typecheck", command: execTool(pm, "tsc --noEmit") });

  if (scripts.lint) gates.push({ name: "lint", command: runScript(pm, "lint") });

  if (scripts.test) gates.push({ name: "test", command: runScript(pm, "test") });
  else if (pm === "bun") gates.push({ name: "test", command: "bun test" });

  if (scripts.build) gates.push({ name: "build", command: runScript(pm, "build") });

  return gates;
}

/** Detects the package manager from which lockfile is present. */
export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

/** Reads the repo from disk into a {@link RepoSnapshot} for detection. */
export function readRepoSnapshot(cwd: string): RepoSnapshot {
  let packageJson: PackageJson | null = null;
  try {
    const raw = readFileSync(join(cwd, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") packageJson = parsed as PackageJson;
  } catch {
    packageJson = null;
  }
  return {
    packageJson,
    hasTsconfig: existsSync(join(cwd, "tsconfig.json")),
    packageManager: detectPackageManager(cwd),
  };
}

/**
 * Resolves the gates + config for a project: a `.crew/verify.json` override
 * (or its `gates`) wins over auto-detection.
 */
export function loadGates(cwd: string): GateConfig {
  const override = readVerifyConfig(cwd);
  const gates =
    override?.gates && override.gates.length > 0
      ? override.gates
      : detectGates(readRepoSnapshot(cwd));
  return {
    autoVerify: override?.autoVerify ?? true,
    maxAttempts: clampAttempts(override?.maxAttempts),
    gates,
  };
}

function readVerifyConfig(cwd: string): Partial<GateConfig> | null {
  const path = join(cwd, ".crew", "verify.json");
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<GateConfig>;
  } catch {
    return null;
  }
}

function clampAttempts(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_ATTEMPTS;
  return Math.min(Math.max(1, Math.floor(value)), 10);
}

function runScript(pm: PackageManager, script: string): string {
  return pm === "npm" ? `npm run ${script}` : `${pm} run ${script}`;
}

function execTool(pm: PackageManager, tool: string): string {
  const runner: Record<PackageManager, string> = {
    bun: "bunx",
    pnpm: "pnpm exec",
    yarn: "yarn exec",
    npm: "npm exec --",
  };
  return `${runner[pm]} ${tool}`;
}
