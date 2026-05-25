import { Box } from "ink";
import { useStore } from "../../state/store.ts";
import { ACCENT } from "../theme.ts";
import { PaneBody } from "./PaneBody.tsx";
import { PaneHeader } from "./PaneHeader.tsx";

const BORDER = 2; // left+right / top+bottom
const HEADER_LINES = 1;

/** One bordered agent pane. Subscribes narrowly to just its own slice of state. */
export function GridPane({
  agentId,
  width,
  height,
  focused,
}: {
  agentId: string;
  width: number;
  height: number;
  focused: boolean;
}) {
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const messages = useStore((s) => s.messages[agentId]);
  const stats = useStore((s) => s.stats[agentId]);
  const verify = useStore((s) => s.verify[agentId]);
  const scrollOffset = useStore((s) => s.scrollOffsets[agentId] ?? 0);
  const toolResults = useStore((s) => s.toolResults);

  if (!agent) return null;

  const innerWidth = Math.max(1, width - BORDER);
  const bodyHeight = Math.max(1, height - BORDER - HEADER_LINES);

  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? ACCENT : "gray"}
      overflow="hidden"
    >
      <PaneHeader
        id={agent.id}
        status={agent.status}
        stats={stats}
        verify={verify}
        width={innerWidth}
      />
      <PaneBody
        messages={messages ?? []}
        toolResults={toolResults}
        width={innerWidth}
        height={bodyHeight}
        scrollOffset={scrollOffset}
      />
    </Box>
  );
}
