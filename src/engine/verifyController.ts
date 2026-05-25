import { loadGates as defaultLoadGates, type Gate, type GateConfig } from "../lib/projectGates.ts";
import { buildFixPrompt, type GateResult, nextAction } from "../lib/verifyDecision.ts";
import type { VerifyState } from "../state/store.ts";
import { runGate as defaultRunGate } from "./verifier.ts";

export type VerifyDeps = {
  readonly cwd: string;
  /** Sends a follow-up prompt to an agent and resolves when its turn completes. */
  readonly send: (agentId: string, prompt: string) => Promise<void>;
  /** Pushes verify state to the store. */
  readonly onState: (agentId: string, state: VerifyState) => void;
  readonly loadGates?: (cwd: string) => GateConfig;
  readonly runGate?: (gate: Gate, cwd: string, signal: AbortSignal) => Promise<GateResult>;
};

/**
 * Runs the verify + auto-fix loop for builder agents. After an agent's turn it
 * runs the project's gates; on the first failure it sends the error back to the
 * agent to fix and re-verifies, up to `maxAttempts`. Only one verify runs at a
 * time (agents share a working directory) — others queue behind it.
 *
 * Each run is abortable (`cancel`/`remove`), and always reaches a terminal state
 * so the UI spinner can never get stuck.
 */
export class VerifyController {
  private readonly deps: VerifyDeps;
  private chain: Promise<void> = Promise.resolve();
  private readonly active = new Map<string, AbortController>();

  constructor(deps: VerifyDeps) {
    this.deps = deps;
  }

  /** True while an agent is mid-verify; used to avoid re-triggering on fix turns. */
  isVerifying(agentId: string): boolean {
    return this.active.has(agentId);
  }

  /** Queues a verify run for an agent behind any in-flight run. */
  enqueue(agentId: string): void {
    if (!this.active.has(agentId)) this.active.set(agentId, new AbortController());
    this.chain = this.chain.then(() => this.run(agentId)).catch(() => undefined);
  }

  /** Aborts an in-flight verify for an agent (e.g. user /stop). */
  cancel(agentId: string): void {
    this.active.get(agentId)?.abort();
  }

  /** Cancels and forgets an agent (e.g. /remove) so its loop stops sending. */
  remove(agentId: string): void {
    this.cancel(agentId);
    this.active.delete(agentId);
  }

  private async run(agentId: string): Promise<void> {
    const config = this.loadGates(this.deps.cwd);
    const gates = config.gates ?? [];
    const { maxAttempts } = config;
    const controller = this.active.get(agentId) ?? new AbortController();
    this.active.set(agentId, controller);

    if (gates.length === 0) {
      this.active.delete(agentId);
      return;
    }

    let settled = false;
    let lastAttempt = 1;
    const emit = (state: VerifyState) => {
      if (state.status !== "running") settled = true;
      this.deps.onState(agentId, state);
    };

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        lastAttempt = attempt;
        if (controller.signal.aborted) break;

        emit({ status: "running", attempt, maxAttempts });
        const results = await this.runGates(gates, controller.signal);
        if (controller.signal.aborted) break;

        const action = nextAction(results, attempt, maxAttempts);
        if (action.kind === "pass") {
          emit({ status: "passed", attempt, maxAttempts });
          return;
        }
        if (action.kind === "giveup") {
          emit({ status: "failed", gate: action.gate.name, attempt, maxAttempts });
          return;
        }

        // fix: hand the failure back to the agent, then loop to re-verify.
        emit({ status: "running", gate: action.gate.name, attempt, maxAttempts });
        await this.deps.send(agentId, buildFixPrompt(action.gate));
      }
    } finally {
      // Aborted, threw, or exhausted without a terminal emit → never leave "running".
      if (!settled) emit({ status: "failed", attempt: lastAttempt, maxAttempts });
      this.active.delete(agentId);
    }
  }

  /** Runs gates in order, stopping at the first failure. */
  private async runGates(gates: readonly Gate[], signal: AbortSignal): Promise<GateResult[]> {
    const run = this.deps.runGate ?? defaultRunGate;
    const results: GateResult[] = [];
    for (const gate of gates) {
      if (signal.aborted) break;
      const result = await run(gate, this.deps.cwd, signal);
      results.push(result);
      if (!result.passed) break;
    }
    return results;
  }

  private loadGates(cwd: string): GateConfig {
    return (this.deps.loadGates ?? defaultLoadGates)(cwd);
  }
}
