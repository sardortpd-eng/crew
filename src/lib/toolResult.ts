const MAX_SUMMARY = 200;

/**
 * Renders a tool's result payload into a one-line summary for the transcript.
 * Tool results arrive as `SDKUserMessage.tool_use_result`, whose shape varies
 * by tool (string, `{stdout}`, an array of content blocks, or arbitrary JSON).
 */
export function summarizeToolResult(payload: unknown): string {
  return truncate(collapse(extractText(payload)));
}

function extractText(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return String(payload);

  // Anthropic content-block array: [{ type: "text", text }, ...]
  if (Array.isArray(payload)) {
    return payload.map(blockText).filter(Boolean).join(" ");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.stdout === "string" && record.stdout.length > 0) return record.stdout;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) {
    return record.content.map(blockText).filter(Boolean).join(" ");
  }
  if (typeof record.stderr === "string" && record.stderr.length > 0) return record.stderr;

  return JSON.stringify(payload);
}

function blockText(block: unknown): string {
  if (typeof block === "string") return block;
  if (block && typeof block === "object" && "text" in block) {
    const text = (block as { text: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY)}…` : text;
}
