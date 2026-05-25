import { heuristicRoute } from "../lib/routeHeuristics.ts";
import { subscriptionEnv } from "./env.ts";
import { getPreset, type PresetEntry } from "./presets.ts";
import type { QueryFn, SDKMessage } from "./types.ts";

const DEFAULT_PRESET = "coder";
const LLM_TIMEOUT_MS = 10_000;

export type RouteMethod = "heuristic" | "llm" | "fallback";
export type RouteResult = {
  readonly preset: string;
  readonly reason: string;
  readonly method: RouteMethod;
};

export type RouterDeps = {
  readonly queryFn: QueryFn;
  /** LLM timeout in ms (default 10s). */
  readonly timeoutMs?: number;
};

/**
 * Chooses the best preset for a free-text prompt. Tries the pure keyword
 * heuristic first (instant, free); falls back to a cheap LLM classifier for
 * ambiguous prompts; falls back to `coder` if that fails. Never throws.
 */
export async function routePrompt(
  prompt: string,
  presets: readonly PresetEntry[],
  deps: RouterDeps,
): Promise<RouteResult> {
  const names = presets.map((p) => p.preset.name);

  const heuristic = heuristicRoute(prompt, names);
  if (heuristic) return { ...heuristic, method: "heuristic" };

  const llm = await llmRoute(prompt, presets, deps);
  if (llm && getPreset(llm.preset)) return { ...llm, method: "llm" };

  const fallback = getPreset(DEFAULT_PRESET) ? DEFAULT_PRESET : (names[0] ?? DEFAULT_PRESET);
  return { preset: fallback, reason: "no clear match; using default", method: "fallback" };
}

async function llmRoute(
  prompt: string,
  presets: readonly PresetEntry[],
  deps: RouterDeps,
): Promise<{ preset: string; reason: string } | null> {
  const names = presets.map((p) => p.preset.name);
  const catalogue = presets.map((p) => `- ${p.preset.name}: ${p.preset.description}`).join("\n");
  const systemPrompt =
    "You are a router for a multi-agent coding tool. Choose the single best agent " +
    "preset to handle the user's request. Respond with ONLY the preset name on its " +
    "own — one word, no punctuation or explanation.\n\n" +
    `Available presets:\n${catalogue}`;

  const controller = new AbortController();
  try {
    const iterator = deps.queryFn({
      prompt,
      options: {
        model: "haiku",
        systemPrompt,
        tools: [],
        maxTurns: 1,
        includePartialMessages: false,
        abortController: controller,
        env: subscriptionEnv(),
      },
    });

    const result = await withTimeout(collectResult(iterator), deps.timeoutMs ?? LLM_TIMEOUT_MS);
    if (result === null) controller.abort(); // timed out → cancel the underlying turn
    return result ? parseDecision(result, names) : null;
  } catch {
    return null;
  }
}

type ResultPayload = { structuredOutput: unknown; text: string };

/** Drains the query generator and returns the success result's payload, or null. */
async function collectResult(iterator: AsyncIterable<SDKMessage>): Promise<ResultPayload | null> {
  for await (const message of iterator) {
    if (message.type === "result" && message.subtype === "success") {
      return {
        structuredOutput: (message as { structured_output?: unknown }).structured_output,
        text: message.result ?? "",
      };
    }
  }
  return null;
}

/** Reads {preset, reason} from structured output, falling back to scanning the text. */
export function parseDecision(
  payload: ResultPayload,
  names: readonly string[],
): { preset: string; reason: string } | null {
  const structured = payload.structuredOutput;
  if (structured && typeof structured === "object") {
    const obj = structured as { preset?: unknown; reason?: unknown };
    if (typeof obj.preset === "string" && names.includes(obj.preset)) {
      return {
        preset: obj.preset,
        reason: typeof obj.reason === "string" ? obj.reason : "chosen by classifier",
      };
    }
  }
  const fromText = pickFromText(payload.text, names);
  return fromText ? { preset: fromText, reason: "chosen by classifier" } : null;
}

/** Finds the first preset name mentioned in free text. */
export function pickFromText(text: string, names: readonly string[]): string | null {
  const lower = text.toLowerCase();
  return names.find((name) => lower.includes(name.toLowerCase())) ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}
