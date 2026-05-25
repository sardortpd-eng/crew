import { useInput } from "ink";
import { computeGridDims } from "../lib/gridLayout.ts";
import { useStore } from "../state/store.ts";

const PAGE_LINES = 8;

/**
 * Keyboard navigation for grid view. Active only when the grid is shown and the
 * prompt is not focused, so digits/arrows move between panes instead of typing.
 *
 * Tab/Shift+Tab cycle panes; arrows move by grid cell; 1–9 jump to a pane;
 * PgUp/PgDn scroll the focused pane's history.
 */
export function useGridKeys(active: boolean): void {
  useInput(
    (input, key) => {
      const { agents, focusedAgentId, focus, scrollPane, resetScroll } = useStore.getState();
      if (agents.length === 0) return;

      const index = Math.max(
        0,
        agents.findIndex((a) => a.id === focusedAgentId),
      );
      const dims = computeGridDims(agents.length);

      // Direct pane selection: 1–9.
      if (/^[1-9]$/.test(input)) {
        const target = agents[Number(input) - 1];
        if (target) focus(target.id);
        return;
      }

      if (key.tab && key.shift) return moveFocus(index, -1, agents, focus);
      if (key.tab) return moveFocus(index, +1, agents, focus);
      if (key.rightArrow) return moveFocus(index, +1, agents, focus);
      if (key.leftArrow) return moveFocus(index, -1, agents, focus);
      if (key.downArrow) return moveFocus(index, +dims.cols, agents, focus);
      if (key.upArrow) return moveFocus(index, -dims.cols, agents, focus);

      if (!focusedAgentId) return;
      if (key.pageUp) scrollPane(focusedAgentId, PAGE_LINES);
      else if (key.pageDown) scrollPane(focusedAgentId, -PAGE_LINES);
      else if (input === "0") resetScroll(focusedAgentId);
    },
    { isActive: active },
  );
}

function moveFocus(
  index: number,
  delta: number,
  agents: readonly { id: string }[],
  focus: (id: string) => void,
): void {
  const next = Math.min(Math.max(0, index + delta), agents.length - 1);
  const target = agents[next];
  if (target) focus(target.id);
}
