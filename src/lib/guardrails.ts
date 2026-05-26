/**
 * Conservative denylist of genuinely destructive shell commands. Patterns are
 * kept tight to avoid blocking legitimate work — this is a last-resort safety
 * net (it runs even in `bypass` mode), not a general policy engine.
 */
const RULES: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(\/|~|\$HOME|\/\*|\.\.)(\s|$)/i,
    reason: "recursive delete of a root/home path",
  },
  { pattern: /\brm\s+-[a-z]*[rf][a-z]*\s+--no-preserve-root/i, reason: "rm --no-preserve-root" },
  { pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "fork bomb" },
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: "filesystem format (mkfs)" },
  {
    pattern: /\bdd\b[^|]*\bof=\/dev\/(sd|nvme|disk|hd)/i,
    reason: "raw write to a disk device (dd)",
  },
  { pattern: />\s*\/dev\/(sd|nvme|disk|hd)\w*/i, reason: "redirect over a disk device" },
  { pattern: /\bgit\s+push\b[^\n]*\s(--force\b|-f\b)/i, reason: "git force-push" },
  {
    pattern: /\bchmod\s+-[a-z]*R[a-z]*\s+777\s+(\/|~)(\s|$)/i,
    reason: "recursive chmod 777 on root/home",
  },
  {
    pattern: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i,
    reason: "piping a download straight into a shell",
  },
  { pattern: /\bsudo\s+rm\b/i, reason: "sudo rm" },
];

/** Returns a deny reason if the command is dangerous, otherwise null. */
export function checkCommand(command: string): string | null {
  const cmd = command.trim();
  for (const rule of RULES) {
    if (rule.pattern.test(cmd)) return rule.reason;
  }
  return null;
}
