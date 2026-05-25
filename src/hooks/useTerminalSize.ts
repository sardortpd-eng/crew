import { useStdout } from "ink";
import { useEffect, useState } from "react";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export type TerminalSize = { readonly columns: number; readonly rows: number };

/**
 * Tracks the terminal's column/row size, updating on resize. Defaults to 80×24
 * when the stream has no dimensions (non-TTY, tests).
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => readSize(stdout));

  useEffect(() => {
    const onResize = () => setSize(readSize(stdout));
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}

function readSize(stdout: NodeJS.WriteStream): TerminalSize {
  return {
    columns: stdout.columns ?? DEFAULT_COLUMNS,
    rows: stdout.rows ?? DEFAULT_ROWS,
  };
}
