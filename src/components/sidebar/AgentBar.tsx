import { Box, Text } from "ink";
import { useStore } from "../../state/store.ts";
import { ACCENT, statusColor } from "../theme.ts";

/**
 * Slim, single-line agent switcher shown above the transcript. Keeps crew's
 * multi-agent context visible without the boxed-sidebar look.
 */
export function AgentBar() {
  const agents = useStore((s) => s.agents);
  const focusedId = useStore((s) => s.focusedAgentId);

  if (agents.length === 0) return null;

  return (
    <Box marginBottom={1}>
      <Text color={ACCENT} bold>
        crew{"  "}
      </Text>
      {agents.map((agent, i) => {
        const focused = agent.id === focusedId;
        return (
          <Box key={agent.id} marginRight={2}>
            <Text color={statusColor(agent.status)}>● </Text>
            <Text bold={focused} color={focused ? "white" : "gray"} underline={focused}>
              {i + 1} {agent.id}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
