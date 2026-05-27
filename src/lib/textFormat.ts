/** Small pure text helpers for the input bar and status line. */

/** Elapsed time: "42s" under a minute, "2m 42s" at or over 60 seconds. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Deletes the last whitespace-delimited word (Ctrl/Option+Backspace). Strips
 * trailing spaces, drops the final token, and keeps one trailing space so the
 * caret sits ready for the next word. "" when nothing is left.
 */
export function deleteLastWord(value: string): string {
  const trimmed = value.replace(/\s+$/, "");
  if (trimmed.length === 0) return "";
  const cut = trimmed.replace(/\S+$/, "");
  return cut;
}
