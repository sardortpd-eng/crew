import { Box, Text } from "ink";
import { useMemo } from "react";
import { flattenMessages, type LineKind, windowLines } from "../../lib/windowing.ts";
import type { Message } from "../../state/store.ts";
import { ACCENT } from "../theme.ts";

/** Renders the windowed transcript lines for one pane. */
export function PaneBody({
  messages,
  toolResults,
  width,
  height,
  scrollOffset,
}: {
  messages: readonly Message[];
  toolResults: Readonly<Record<string, string>>;
  width: number;
  height: number;
  scrollOffset: number;
}) {
  const lines = useMemo(
    () => flattenMessages(messages, width, toolResults),
    [messages, width, toolResults],
  );
  const { visible, atBottom, total } = windowLines(lines, height, scrollOffset);

  if (total === 0) {
    return (
      <Box height={height}>
        <Text dimColor>idle</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={height}>
      {!atBottom && <Text dimColor>▲ more</Text>}
      {visible.map((line, i) => (
        <Text key={i} color={lineColor(line.kind)} dimColor={isDim(line.kind)} wrap="truncate-end">
          {line.text}
        </Text>
      ))}
    </Box>
  );
}

function lineColor(kind: LineKind): string | undefined {
  if (kind === "tool") return ACCENT; // the ⏺ action bullet stays accent
  if (kind === "error") return "red";
  return undefined; // assistant + user render in the default (bright) foreground
}

function isDim(kind: LineKind): boolean {
  // Only secondary detail is dimmed; the main prose stays readable.
  return kind === "toolResult";
}
