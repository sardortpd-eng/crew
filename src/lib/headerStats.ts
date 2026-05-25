import type { AgentStats } from "../state/store.ts";

/** Formats a USD cost as `$0.42` (or `$1.2k` for large totals). */
export function formatCost(usd: number): string {
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
  return `$${usd.toFixed(usd < 0.01 && usd > 0 ? 4 : 2)}`;
}

/** Formats a token count compactly: `850`, `12.3k`, `1.2M`. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Sums cost and (input+output) tokens across all agents. */
export function aggregateTotals(stats: Readonly<Record<string, AgentStats>>): {
  cost: number;
  tokens: number;
} {
  let cost = 0;
  let tokens = 0;
  for (const s of Object.values(stats)) {
    cost += s.costUsd;
    tokens += s.inputTokens + s.outputTokens;
  }
  return { cost, tokens };
}

/** Strips the date suffix and `claude-` prefix from a model id for display. */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}
