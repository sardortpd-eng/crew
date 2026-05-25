import { Box, Text } from "ink";
import type { AgentStatus } from "../../engine/types.ts";
import { formatCost, formatTokens, shortModel } from "../../lib/headerStats.ts";
import type { AgentStats, VerifyState } from "../../state/store.ts";
import { statusColor, verifyColor, verifyGlyph } from "../theme.ts";

/** One-line pane header: status dot + id + verify glyph (left), cost/tokens (right). */
export function PaneHeader({
  id,
  status,
  stats,
  verify,
  width,
}: {
  id: string;
  status: AgentStatus;
  stats?: AgentStats;
  verify?: VerifyState;
  width: number;
}) {
  const right = stats
    ? `${formatCost(stats.costUsd)} · ${formatTokens(stats.inputTokens + stats.outputTokens)}`
    : "";
  const model = stats?.model ? shortModel(stats.model) : "";

  return (
    <Box width={width} justifyContent="space-between">
      <Box flexShrink={1}>
        <Text color={statusColor(status)}>● </Text>
        <Text bold wrap="truncate">
          {id}
        </Text>
        {model.length > 0 && (
          <Text dimColor wrap="truncate">
            {" "}
            {model}
          </Text>
        )}
        {verify && verify.status !== "idle" && (
          <Text color={verifyColor(verify.status)}> {verifyGlyph(verify.status)}</Text>
        )}
      </Box>
      {right.length > 0 && (
        <Text dimColor wrap="truncate">
          {right}
        </Text>
      )}
    </Box>
  );
}
