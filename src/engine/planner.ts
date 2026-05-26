import type { PresetEntry } from "./presets.ts";
import { subscriptionEnv } from "./env.ts";
import type { QueryFn, SDKMessage } from "./types.ts";

const MAX_TASKS = 10;
const DEFAULT_PRESET = "coder";
const TIMEOUT_MS = 30_000;

export type PlannedTask = { readonly title: string; readonly preset: string };

export type PlannerDeps = {
  readonly queryFn: QueryFn;
  readonly timeoutMs?: number;
};

/**
 * Decomposes a high-level goal into an ordered list of concrete tasks, each
 * assigned to the best-fit preset. Uses a cheap one-shot LLM call that replies
 * with `preset: task` lines; never throws (falls back to a single coder task).
 */
export async function planGoal(
  goal: string,
  presets: readonly PresetEntry[],
  deps: PlannerDeps,
): Promise<PlannedTask[]> {
  const names = presets.map((p) => p.preset.name);
  const catalogue = presets.map((p) => `- ${p.preset.name}: ${p.preset.description}`).join("\n");
  const systemPrompt =
    "You are a planner for a multi-agent coding tool. Break the user's goal into a short, " +
    "ordered list of concrete, independently-runnable tasks (3–8). Assign each to the best " +
    "agent preset. Reply with ONE task per line as `preset: task description` — nothing else.\n\n" +
    `Available presets:\n${catalogue}`;

  const controller = new AbortController();
  try {
    const iterator = deps.queryFn({
      prompt: goal,
      options: {
        model: "sonnet",
        systemPrompt,
        tools: [],
        maxTurns: 1,
        includePartialMessages: false,
        abortController: controller,
        env: subscriptionEnv(),
      },
    });
    const text = await withTimeout(collectText(iterator), deps.timeoutMs ?? TIMEOUT_MS);
    if (text === null) controller.abort();
    const tasks = text ? parsePlan(text, names) : [];
    return tasks.length > 0 ? tasks : [{ title: goal.trim(), preset: DEFAULT_PRESET }];
  } catch {
    return [{ title: goal.trim(), preset: DEFAULT_PRESET }];
  }
}

/** Parses `preset: task` lines into tasks, validating presets (fallback coder). */
export function parsePlan(text: string, validPresets: readonly string[]): PlannedTask[] {
  const valid = new Set(validPresets);
  const tasks: PlannedTask[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^\s*[-*\d.)]+\s*/, "").trim(); // strip bullets/numbering
    const match = line.match(/^([a-z][a-z0-9-]*)\s*:\s*(.+)$/i);
    if (!match) continue;
    const preset = match[1]!.toLowerCase();
    const title = match[2]!.trim();
    if (title.length === 0) continue;
    tasks.push({ title, preset: valid.has(preset) ? preset : DEFAULT_PRESET });
    if (tasks.length >= MAX_TASKS) break;
  }
  return tasks;
}

async function collectText(iterator: AsyncIterable<SDKMessage>): Promise<string | null> {
  for await (const message of iterator) {
    if (message.type === "result" && message.subtype === "success") return message.result ?? "";
  }
  return null;
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
