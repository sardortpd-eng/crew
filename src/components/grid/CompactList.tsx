import { Box, Text } from "ink";
import { formatCost } from "../../lib/headerStats.ts";
import { useStore } from "../../state/store.ts";
import { statusColor, statusLabel } from "../theme.ts";

/**
 * Degraded view for terminals too small to tile: one line per agent. Also used
 * when there are more agents than grid cells.
 */
export function CompactList() {
  const agents = useStore((s) => s.agents);
  const focusedId = useStore((s) => s.focusedAgentId);
  const stats = useStore((s) => s.stats);

  return (
    <Box flexDirection="column">
      <Text dimColor>Terminal too small to tile — compact view:</Text>
      {agents.map((agent, i) => {
        const focused = agent.id === focusedId;
        const agentStats = stats[agent.id];
        const cost = agentStats ? formatCost(agentStats.costUsd) : "";
        return (
          <Box key={agent.id}>
            <Text color={statusColor(agent.status)}>● </Text>
            <Text bold={focused} color={focused ? "white" : "gray"}>
              {i + 1} {agent.id}
            </Text>
            <Text dimColor>
              {" "}
              · {statusLabel(agent.status)}
              {cost ? ` · ${cost}` : ""}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
