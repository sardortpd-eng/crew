import { useTerminalSize } from "../../hooks/useTerminalSize.ts";
import { useStore } from "../../state/store.ts";
import { PaneBody } from "../grid/PaneBody.tsx";
import { Welcome } from "../Welcome.tsx";

/**
 * Focus-view transcript for the focused agent. Renders through the same
 * windowed pipeline as grid panes (flatten → window), bounded to `height` rows
 * so a long transcript can never overrun the terminal — it shows the tail and
 * scrolls with PgUp/PgDn via the agent's scroll offset.
 */
export function AgentPane({ height }: { height: number }) {
  const { columns } = useTerminalSize();
  const focusedId = useStore((s) => s.focusedAgentId);
  const messages = useStore((s) => (focusedId ? s.messages[focusedId] : undefined));
  const toolResults = useStore((s) => s.toolResults);
  const scrollOffset = useStore((s) => (focusedId ? (s.scrollOffsets[focusedId] ?? 0) : 0));

  if (!focusedId) return <Welcome />;

  return (
    <PaneBody
      messages={messages ?? []}
      toolResults={toolResults}
      width={Math.max(1, columns - 2)} // outer paddingX={1}
      height={Math.max(1, height)}
      scrollOffset={scrollOffset}
    />
  );
}
