import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { ToolBlock } from "../../engine/types.ts";
import { type Message, useStore } from "../../state/store.ts";
import { ACCENT } from "../theme.ts";

const MAX_TOOL_SUMMARY = 72;

/** Renders one transcript entry in the Claude Code visual style. */
export function MessageView({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <Box marginBottom={1}>
        <Text dimColor>{"> "}</Text>
        <Text dimColor>{message.text}</Text>
      </Box>
    );
  }

  if (message.role === "error") {
    return (
      <Row glyph="⏺" color="red" marginBottom>
        <Text color="red">{message.text}</Text>
      </Row>
    );
  }

  // assistant: skip empty placeholders (e.g. a turn that only errored).
  if (message.text.length === 0 && message.tools.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {message.tools.map((tool) => (
        <ToolRow key={tool.id} tool={tool} />
      ))}
      {message.text.length > 0 && (
        <Row glyph="⏺" color={ACCENT}>
          <Text>
            {message.text}
            {!message.done && <Text color="gray">▋</Text>}
          </Text>
        </Row>
      )}
    </Box>
  );
}

/** A bullet + hanging-indented body, so wrapped lines align past the glyph. */
function Row({
  glyph,
  color,
  marginBottom,
  children,
}: {
  glyph: string;
  color: string;
  marginBottom?: boolean;
  children: ReactNode;
}) {
  return (
    <Box marginBottom={marginBottom ? 1 : 0}>
      <Box width={2} flexShrink={0}>
        <Text color={color}>{glyph}</Text>
      </Box>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
}

/** `⏺ Tool(summary)` with a `⎿` detail branch, mirroring Claude Code. */
function ToolRow({ tool }: { tool: ToolBlock }) {
  return (
    <Box flexDirection="column">
      <Row glyph="⏺" color={ACCENT}>
        <Text>
          <Text bold>{tool.name}</Text>
          <Text dimColor>({summarize(tool.input)})</Text>
        </Text>
      </Row>
      <ToolResultLine toolId={tool.id} />
    </Box>
  );
}

/** The `⎿` branch under a tool call: shows the real result, or `running…`. */
function ToolResultLine({ toolId }: { toolId: string }) {
  const result = useStore((s) => s.toolResults[toolId]);
  return (
    <Box>
      <Box width={2} flexShrink={0} />
      <Text dimColor wrap="truncate-end">{`⎿  ${result ?? "running…"}`}</Text>
    </Box>
  );
}

/** Picks the most telling field of a tool's input for a one-line summary. */
function summarize(input: Record<string, unknown>): string {
  const key = ["command", "file_path", "path", "pattern", "query", "url"].find(
    (k) => typeof input[k] === "string",
  );
  const value = key ? String(input[key]) : JSON.stringify(input);
  return value.length > MAX_TOOL_SUMMARY ? `${value.slice(0, MAX_TOOL_SUMMARY)}…` : value;
}
