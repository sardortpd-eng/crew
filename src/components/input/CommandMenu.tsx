import { Box, Text } from "ink";
import type { CommandSpec } from "../../lib/commandCatalog.ts";
import { commandUsage } from "../../lib/commandCatalog.ts";
import { ACCENT } from "../theme.ts";

const MAX_ROWS = 8;

/**
 * The slash-command autocomplete dropdown. Shows up to {@link MAX_ROWS}
 * matching commands (windowed around the selection) with their usage and a
 * one-line description; the selected row is highlighted. Purely presentational.
 */
export function CommandMenu({
  matches,
  selected,
}: {
  matches: readonly CommandSpec[];
  selected: number;
}) {
  if (matches.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>no matching command · Esc to clear</Text>
      </Box>
    );
  }

  const start = Math.min(
    Math.max(0, selected - MAX_ROWS + 1),
    Math.max(0, matches.length - MAX_ROWS),
  );
  const shown = matches.slice(start, start + MAX_ROWS);
  const usageWidth = Math.min(Math.max(...shown.map((s) => commandUsage(s).length)), 30);

  return (
    <Box flexDirection="column" paddingX={1}>
      {shown.map((spec, i) => {
        const isSelected = start + i === selected;
        return (
          <Text key={spec.name} backgroundColor={isSelected ? ACCENT : undefined}>
            <Text color={isSelected ? "black" : ACCENT} bold={isSelected}>
              {commandUsage(spec).padEnd(usageWidth)}
            </Text>
            <Text color={isSelected ? "black" : undefined} dimColor={!isSelected}>
              {"  "}
              {spec.summary}
            </Text>
          </Text>
        );
      })}
      <Text dimColor>
        {matches.length > MAX_ROWS ? `↑↓ ${matches.length} matches · ` : "↑↓ select · "}
        Tab complete · Enter run
      </Text>
    </Box>
  );
}
