import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { AgentStatus } from "../engine/types.ts";
import { formatElapsed } from "../lib/textFormat.ts";
import { Spinner } from "./Spinner.tsx";
import { ACCENT, statusLabel } from "./theme.ts";

/** Claude Code style busy line: spinner + label + elapsed + interrupt hint. */
export function StatusLine({ status }: { status: AgentStatus }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box>
      <Spinner color={ACCENT} />
      <Text color={ACCENT}> {statusLabel(status)}…</Text>
      <Text dimColor> ({formatElapsed(seconds)} · esc to interrupt)</Text>
    </Box>
  );
}
