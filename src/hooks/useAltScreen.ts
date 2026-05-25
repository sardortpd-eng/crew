import { useStdout } from "ink";
import { useEffect } from "react";

export const ENTER_ALT_SCREEN = "\x1B[?1049h";
export const LEAVE_ALT_SCREEN = "\x1B[?1049l";

const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

/**
 * Enters the terminal's alternate screen buffer on mount (vim/htop style) and
 * restores the normal buffer on unmount and on process exit/signals — so the
 * shell scrollback is never left clobbered, even on an abrupt exit.
 */
export function useAltScreen(enabled = true): void {
  const { write } = useStdout();

  useEffect(() => {
    if (!enabled) return;
    write(ENTER_ALT_SCREEN);

    const restore = () => write(LEAVE_ALT_SCREEN);
    process.once("exit", restore);
    for (const signal of SIGNALS) process.once(signal, restore);

    return () => {
      restore();
      process.off("exit", restore);
      for (const signal of SIGNALS) process.off(signal, restore);
    };
  }, [enabled, write]);
}
