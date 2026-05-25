import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { AgentStatus } from "../engine/types.ts";
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
      <Text dimColor> ({seconds}s · esc to interrupt)</Text>
    </Box>
  );
}
