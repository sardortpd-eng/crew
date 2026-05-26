import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { useAltScreen } from "../hooks/useAltScreen.ts";
import { useCrew } from "../hooks/useCrew.ts";
import { useGridKeys } from "../hooks/useGridKeys.ts";
import { useStore } from "../state/store.ts";
import { GridView } from "./grid/GridView.tsx";
import { HeaderBar } from "./HeaderBar.tsx";
import { InputBar } from "./input/InputBar.tsx";
import { AgentPane } from "./pane/AgentPane.tsx";
import { StatusLine } from "./StatusLine.tsx";
import { AgentBar } from "./sidebar/AgentBar.tsx";
import { TaskBoard } from "./TaskBoard.tsx";
import { ACCENT, isBusy } from "./theme.ts";
import { VerifyLine } from "./VerifyLine.tsx";

/**
 * Root layout: header bar, body (grid or focus), busy line, input box, hint.
 *
 * Input focus: in focus view the prompt is always live. In grid view it starts
 * in nav mode (digits/arrows switch panes); press `i`/`/` to type, `esc` to
 * return to nav. `useGridKeys` is inactive whenever the prompt is live so keys
 * never double-fire.
 */
export function App({ cwd }: { cwd: string }) {
  const { exit } = useApp();
  const crew = useCrew(cwd);
  const [notice, setNotice] = useState<string>(crew.startupNotice ?? "");
  const [typing, setTyping] = useState(false);

  const agents = useStore((s) => s.agents);
  const viewMode = useStore((s) => s.viewMode);
  const focused = useStore((s) => s.agents.find((a) => a.id === s.focusedAgentId));
  const routerStatus = useStore((s) => s.routerStatus);
  const hasPending = useStore((s) => s.permissionRequests.length > 0);
  const busy = focused ? isBusy(focused.status) : false;

  const grid = viewMode === "grid";
  const inputActive = (!grid || typing) && !hasPending;

  useAltScreen(true);
  useGridKeys(grid && !inputActive && !hasPending);

  // Leaving grid (or losing all agents) ends nav typing state cleanly.
  useEffect(() => {
    if (!grid) setTyping(false);
  }, [grid]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }
    if (key.tab && key.shift) {
      useStore.getState().cycleSafetyMode(); // Shift+Tab cycles the safety mode
      return;
    }
    if (key.ctrl && input === "g") {
      useStore.getState().toggleViewMode();
      setTyping(false);
      return;
    }
    if (hasPending) return;

    // When the input is live, InputBar owns Esc (clear the line, then onEscape).
    // Only handle Esc here for the inactive-input case (grid nav).
    if (key.escape) {
      if (!inputActive && busy) crew.interrupt();
      return;
    }
    // Enter typing mode from grid nav.
    if (grid && !typing && (input === "i" || input === "/" || key.return)) {
      setTyping(true);
    }
  });

  /**
   * Esc on an empty input line: dismiss a notice (e.g. /help), else leave grid
   * typing, else interrupt a busy agent.
   */
  function handleEscape(): void {
    if (notice.length > 0 || routerStatus) {
      setNotice("");
      useStore.getState().setRouterStatus(null);
      return;
    }
    if (grid && typing) setTyping(false);
    else if (busy) crew.interrupt();
  }

  function handleSubmit(raw: string): void {
    const result = crew.handleInput(raw);
    if (result.quit) {
      exit();
      return;
    }
    setNotice(result.notice ?? "");
    if (grid) setTyping(false); // back to nav after a grid command
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <HeaderBar />
      {!grid && <AgentBar />}

      {grid ? <GridView /> : <AgentPane />}

      {!grid && <TaskBoard />}

      {!grid && busy && focused && (
        <Box marginTop={1}>
          <StatusLine status={focused.status} />
        </Box>
      )}

      {!grid && <VerifyLine />}

      {routerStatus && (
        <Box>
          <Text color={ACCENT}>{routerStatus}</Text>
        </Box>
      )}

      {notice.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {notice.split("\n").map((line, i) => (
            <Text key={i} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <InputBar onSubmit={handleSubmit} onEscape={handleEscape} active={inputActive} />
      </Box>

      <Hint grid={grid} hasAgents={agents.length > 0} hasPending={hasPending} />
    </Box>
  );
}

/** Dim shortcut hint under the input box. */
function Hint({
  grid,
  hasAgents,
  hasPending,
}: {
  grid: boolean;
  hasAgents: boolean;
  hasPending: boolean;
}) {
  const text = hasPending
    ? "y allow · n deny"
    : grid
      ? "Shift+Tab safety mode · Ctrl+G focus view · /broadcast · esc to interrupt"
      : hasAgents
        ? "Shift+Tab safety mode · Ctrl+G grid · /focus <n> · esc to interrupt"
        : "/help for commands · /spawn to add agents · Shift+Tab safety mode";
  return (
    <Box paddingX={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}
