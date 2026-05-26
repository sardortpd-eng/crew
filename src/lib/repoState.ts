/** Files/dirs that don't count as "source" when judging an empty project. */
const IGNORED = new Set([
  "node_modules",
  ".git",
  ".crew",
  ".github",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "biome.json",
  ".gitignore",
]);

const IGNORED_PREFIXES = ["tsconfig", "readme", "license", "."];

/**
 * True when a directory has essentially no source yet — only config/scaffolding.
 * Used to tell the planner not to waste a task "exploring" an empty repo.
 */
export function isGreenfield(files: readonly string[]): boolean {
  const source = files.filter((f) => {
    const lower = f.toLowerCase();
    if (IGNORED.has(f) || IGNORED.has(lower)) return false;
    return !IGNORED_PREFIXES.some((p) => lower.startsWith(p));
  });
  return source.length <= 1;
}
