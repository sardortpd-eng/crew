import { Box, Text } from "ink";
import { useStore } from "../../state/store.ts";
import { Welcome } from "../Welcome.tsx";
import { MessageView } from "./MessageView.tsx";

const VISIBLE_MESSAGES = 40;

/** Flowing single-column transcript for the focused agent, Claude Code style. */
export function AgentPane() {
  const focusedId = useStore((s) => s.focusedAgentId);
  const messages = useStore((s) => (focusedId ? s.messages[focusedId] : undefined));

  if (!focusedId) return <Welcome />;

  const recent = (messages ?? []).slice(-VISIBLE_MESSAGES);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {recent.length === 0 ? (
        <Text dimColor>Ready. Send a message or a task.</Text>
      ) : (
        recent.map((message, i) => <MessageView key={i} message={message} />)
      )}
    </Box>
  );
}
