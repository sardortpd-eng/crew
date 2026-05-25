import { Box, Text } from "ink";
import { presetNames } from "../engine/presets.ts";
import { ACCENT } from "./theme.ts";

/** Block-letter "crew" wordmark (Calvin S figlet font). */
const WORDMARK = ["┌─┐┬─┐┌─┐┬ ┬", "│  ├┬┘├┤ │││", "└─┘┴└─└─┘└┴┘"];

const QUICK_START: ReadonlyArray<{ cmd: string; desc: string }> = [
  { cmd: "/spawn coder", desc: "add a coding agent" },
  { cmd: "/spawn reviewer", desc: "read-only code review" },
  { cmd: "/broadcast <task>", desc: "task every agent at once" },
  { cmd: "/view grid", desc: "tile all agents side by side" },
  { cmd: "/help", desc: "see all commands" },
];

const CMD_WIDTH = 19;

/** Empty-state shown before any agent is spawned. */
export function Welcome() {
  return (
    <Box flexDirection="column" flexGrow={1} marginTop={1}>
      <Box flexDirection="column">
        {WORDMARK.map((line, i) => (
          <Text key={i} color={ACCENT} bold>
            {line}
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Orchestrate multiple Claude agents — on your subscription.</Text>
      </Box>

      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        alignSelf="flex-start"
      >
        <Text bold color={ACCENT}>
          quick start
        </Text>
        {QUICK_START.map(({ cmd, desc }) => (
          <Box key={cmd}>
            <Text color={ACCENT}>{cmd.padEnd(CMD_WIDTH)}</Text>
            <Text dimColor>{desc}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>presets </Text>
        <Text>{presetNames().join("  ")}</Text>
      </Box>
    </Box>
  );
}
