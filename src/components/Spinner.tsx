import { Text } from "ink";
import { useEffect, useState } from "react";
import { SPINNER_FRAMES } from "./theme.ts";

const FRAME_MS = 120;

/** A single animated star glyph, Claude Code style. */
export function Spinner({ color }: { color?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), FRAME_MS);
    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{SPINNER_FRAMES[frame]}</Text>;
}
