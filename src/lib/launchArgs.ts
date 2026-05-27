/**
 * Pure parsing of crew's launch flags. Kept tiny and side-effect-free so it's
 * unit-testable; `cli.tsx` applies the result to the store before render.
 */
import type { SafetyMode } from "../state/store.ts";

export type LaunchArgs = {
  /** Safety mode to start in, from `--dangerously-skip-permissions` / `--plan`. */
  readonly safetyMode?: SafetyMode;
};

/** Reads recognized flags from an argv slice (e.g. `process.argv.slice(2)`). */
export function parseLaunchArgs(argv: readonly string[]): LaunchArgs {
  if (argv.includes("--dangerously-skip-permissions")) {
    return { safetyMode: "bypassPermissions" };
  }
  if (argv.includes("--plan")) return { safetyMode: "plan" };
  return {};
}
