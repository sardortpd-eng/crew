import type { Gate } from "./projectGates.ts";

/**
 * Final status of a task on the board after its turn (+ verify) settles.
 * A task is failed if the agent errored OR its verify ended `failed` — so the
 * runner can pause instead of building later tasks on a broken step.
 */
export function taskOutcome(
  agentErrored: boolean,
  verifyStatus?: "idle" | "running" | "passed" | "failed",
): "done" | "failed" {
  return agentErrored || verifyStatus === "failed" ? "failed" : "done";
}

/** Outcome of running one gate command. */
export type GateResult = {
  readonly name: string;
  readonly passed: boolean;
  readonly exitCode: number;
  readonly output: string;
};

/** What the verify loop should do after a round of gates. */
export type VerifyAction =
  | { readonly kind: "pass" }
  | { readonly kind: "fix"; readonly gate: GateResult }
  | { readonly kind: "giveup"; readonly gate: GateResult };

/**
 * Decides the next step from a round of gate results. Gates run in order and
 * stop at the first failure, so `results` ends with the failing gate (if any).
 * A failure with attempts remaining → fix; out of attempts → give up; all
 * passed → pass.
 */
export function nextAction(
  results: readonly GateResult[],
  attempt: number,
  maxAttempts: number,
): VerifyAction {
  const failed = results.find((r) => !r.passed);
  if (!failed) return { kind: "pass" };
  return attempt < maxAttempts ? { kind: "fix", gate: failed } : { kind: "giveup", gate: failed };
}

const MAX_OUTPUT = 2000;

/** Builds the follow-up prompt that asks the agent to fix a failing gate. */
export function buildFixPrompt(gate: GateResult): string {
  const output = gate.output.length > MAX_OUTPUT ? gate.output.slice(-MAX_OUTPUT) : gate.output;
  return [
    `Your change did not pass the "${gate.name}" check (exit ${gate.exitCode}).`,
    "",
    "Output:",
    "```",
    output.trim(),
    "```",
    "",
    "Fix the root cause and keep the change minimal. Do not disable or skip the check.",
  ].join("\n");
}

/** True for gates intended to run before the expensive ones (kept for ordering tests). */
export function gateNames(gates: readonly Gate[]): string[] {
  return gates.map((g) => g.name);
}
