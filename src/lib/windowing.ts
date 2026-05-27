import type { Message } from "../state/store.ts";

/** Kind of a rendered line, so the renderer can style it. */
export type LineKind = "user" | "assistant" | "tool" | "toolResult" | "error" | "separator";

export type RenderLine = { readonly kind: LineKind; readonly text: string };

/**
 * Greedy word-wrap to `width`, hard-breaking tokens longer than the width.
 * Returns at least one (possibly empty) line.
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];

  for (const rawLine of text.split("\n")) {
    const startCount = lines.length;
    let current = "";

    for (const word of rawLine.split(/\s+/).filter((w) => w.length > 0)) {
      if (word.length > width) {
        if (current.length > 0) {
          lines.push(current);
          current = "";
        }
        const chunks = hardBreak(word, width);
        const last = chunks.pop() ?? "";
        for (const chunk of chunks) lines.push(chunk);
        current = last;
      } else if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current.length > 0) lines.push(current);
    if (lines.length === startCount) lines.push("");
  }

  return lines;
}

function hardBreak(token: string, width: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < token.length; i += width) chunks.push(token.slice(i, i + width));
  return chunks;
}

/**
 * Flattens an agent's messages into pre-wrapped render lines sized to `width`.
 * Tool results (looked up by tool-use id) render as a `⎿` branch under the call.
 */
export function flattenMessages(
  messages: readonly Message[],
  width: number,
  toolResults: Readonly<Record<string, string>>,
): RenderLine[] {
  const out: RenderLine[] = [];
  for (const message of messages) {
    // Blank line between messages so consecutive turns don't run together.
    if (out.length > 0) out.push({ kind: "separator", text: "" });
    if (message.role === "user") {
      pushWrapped(out, "user", `> ${message.text}`, width);
    } else if (message.role === "error") {
      pushWrapped(out, "error", `✗ ${message.text}`, width);
    } else {
      for (const tool of message.tools) {
        const summary = summarizeToolInput(tool.input);
        pushWrapped(out, "tool", `⏺ ${tool.name}${summary ? ` ${summary}` : ""}`, width);
        const detail = toolResults[tool.id] ?? "running…";
        pushWrapped(out, "toolResult", `  ⎿ ${detail}`, width);
      }
      if (message.text.length > 0) pushWrapped(out, "assistant", `⏺ ${message.text}`, width);
    }
  }
  return out;
}

function pushWrapped(out: RenderLine[], kind: LineKind, text: string, width: number): void {
  for (const line of wrapText(text, width)) out.push({ kind, text: line });
}

const MAX_TOOL_SUMMARY = 72;
const TELLING_KEYS = ["command", "file_path", "path", "pattern", "query", "url"] as const;

/** The most telling field of a tool's input, for a one-line summary ("" if none). */
export function summarizeToolInput(input: Record<string, unknown>): string {
  const key = TELLING_KEYS.find((k) => typeof input[k] === "string");
  if (key) return truncateSummary(String(input[key]));
  if (Object.keys(input).length === 0) return "";
  return truncateSummary(JSON.stringify(input));
}

function truncateSummary(value: string): string {
  return value.length > MAX_TOOL_SUMMARY ? `${value.slice(0, MAX_TOOL_SUMMARY)}…` : value;
}

/** Keeps a scroll offset within `[0, max]` for the given content/viewport. */
export function clampScroll(offset: number, total: number, viewportHeight: number): number {
  const max = Math.max(0, total - viewportHeight);
  return Math.min(Math.max(0, offset), max);
}

export type Window = {
  readonly visible: readonly RenderLine[];
  readonly atBottom: boolean;
  readonly total: number;
};

/**
 * Returns the visible slice for a viewport. `offset === 0` pins to the tail
 * (newest); a positive offset scrolls up into history.
 */
export function windowLines(
  lines: readonly RenderLine[],
  viewportHeight: number,
  offset: number,
): Window {
  const total = lines.length;
  if (viewportHeight <= 0) return { visible: [], atBottom: offset === 0, total };
  const clamped = clampScroll(offset, total, viewportHeight);
  const end = total - clamped;
  const start = Math.max(0, end - viewportHeight);
  return { visible: lines.slice(start, end), atBottom: clamped === 0, total };
}
