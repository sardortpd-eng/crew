import { Box, Text } from "ink";
import { useStore } from "../state/store.ts";
import { verifyColor, verifyGlyph } from "./theme.ts";

/** Verify status for the focused agent (focus view). Renders nothing when idle. */
export function VerifyLine() {
  const state = useStore((s) => (s.focusedAgentId ? s.verify[s.focusedAgentId] : undefined));
  if (!state || state.status === "idle") return null;

  const color = verifyColor(state.status);
  const glyph = verifyGlyph(state.status);
  const progress = `${state.attempt}/${state.maxAttempts}`;

  return (
    <Box>
      <Text color={color}>{glyph} </Text>
      {state.status === "running" && (
        <Text color={color}>
          verifying{state.gate ? `: fixing ${state.gate}` : "…"} <Text dimColor>({progress})</Text>
        </Text>
      )}
      {state.status === "passed" && <Text color={color}>verified</Text>}
      {state.status === "failed" && (
        <Text color={color}>
          {state.gate ?? "checks"} failing <Text dimColor>(gave up after {progress})</Text>
        </Text>
      )}
    </Box>
  );
}
