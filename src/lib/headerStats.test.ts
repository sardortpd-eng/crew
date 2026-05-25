import { describe, expect, test } from "bun:test";
import type { AgentStats } from "../state/store.ts";
import { aggregateTotals, formatCost, formatTokens, shortModel } from "./headerStats.ts";

const stat = (over: Partial<AgentStats>): AgentStats => ({
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  contextWindow: 0,
  model: "sonnet",
  ...over,
});

describe("formatCost", () => {
  test("formats small and large costs", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(0.42)).toBe("$0.42");
    expect(formatCost(1500)).toBe("$1.5k");
  });
});

describe("formatTokens", () => {
  test("compacts thousands and millions", () => {
    expect(formatTokens(850)).toBe("850");
    expect(formatTokens(12300)).toBe("12.3k");
    expect(formatTokens(2_000_000)).toBe("2.0M");
  });
});

describe("aggregateTotals", () => {
  test("sums cost and input+output tokens across agents", () => {
    const totals = aggregateTotals({
      a: stat({ costUsd: 0.01, inputTokens: 100, outputTokens: 20 }),
      b: stat({ costUsd: 0.02, inputTokens: 50, outputTokens: 10 }),
    });
    expect(totals.cost).toBeCloseTo(0.03);
    expect(totals.tokens).toBe(180);
  });

  test("is zero for no agents", () => {
    expect(aggregateTotals({})).toEqual({ cost: 0, tokens: 0 });
  });
});

describe("shortModel", () => {
  test("strips claude- prefix and date suffix", () => {
    expect(shortModel("claude-sonnet-4-5-20250929")).toBe("sonnet-4-5");
    expect(shortModel("opus")).toBe("opus");
  });
});
