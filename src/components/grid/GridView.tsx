import { Box } from "ink";
import { useTerminalSize } from "../../hooks/useTerminalSize.ts";
import {
  assignCells,
  computeGridDims,
  computePaneBox,
  MAX_GRID_AGENTS,
  tooSmallForGrid,
} from "../../lib/gridLayout.ts";
import { useStore } from "../../state/store.ts";
import { CompactList } from "./CompactList.tsx";
import { GridPane } from "./GridPane.tsx";

/** Tiles all agents into a responsive grid sized to the terminal. */
export function GridView() {
  const agents = useStore((s) => s.agents);
  const focusedId = useStore((s) => s.focusedAgentId);
  const { columns, rows } = useTerminalSize();

  const tiled = agents.slice(0, MAX_GRID_AGENTS);
  const dims = computeGridDims(tiled.length);
  const { paneWidth, paneHeight } = computePaneBox(columns, rows, dims);

  if (tiled.length === 0 || tooSmallForGrid(paneWidth, paneHeight)) {
    return <CompactList />;
  }

  const cells = assignCells(
    tiled.map((a) => a.id),
    dims,
  );

  return (
    <Box flexDirection="column">
      {Array.from({ length: dims.rows }, (_, row) => (
        <Box key={row} flexDirection="row">
          {Array.from({ length: dims.cols }, (_, col) => {
            const cell = cells.find((c) => c.row === row && c.col === col);
            if (!cell) {
              return <Box key={col} width={paneWidth} height={paneHeight} />;
            }
            return (
              <GridPane
                key={cell.id}
                agentId={cell.id}
                width={paneWidth}
                height={paneHeight}
                focused={cell.id === focusedId}
              />
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
