import { appendFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** One line in the audit trail. */
export type AuditEntry = {
  readonly ts: string;
  readonly kind: string;
  readonly agentId?: string;
  readonly detail?: string;
};

const MAX_DETAIL = 200;

export function auditPath(cwd: string): string {
  return join(cwd, ".crew", "audit.jsonl");
}

/**
 * Appends one entry to `.crew/audit.jsonl` (an append-only record of what the
 * AI did). Async + best-effort: never throws into the caller, so logging can't
 * break a turn. Returns the write promise so tests can await a flush.
 */
export async function appendAudit(
  cwd: string,
  entry: Omit<AuditEntry, "ts"> & { ts?: string },
): Promise<void> {
  const path = auditPath(cwd);
  const line = JSON.stringify({
    ts: entry.ts ?? new Date().toISOString(),
    kind: entry.kind,
    ...(entry.agentId ? { agentId: entry.agentId } : {}),
    ...(entry.detail ? { detail: truncate(entry.detail) } : {}),
  });
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${line}\n`, "utf8");
  } catch {
    /* logging is best-effort */
  }
}

/** Reads the last `limit` entries (newest last). Tolerates malformed lines. */
export function readAudit(cwd: string, limit = 20): AuditEntry[] {
  const path = auditPath(cwd);
  if (!existsSync(path)) return [];
  let lines: string[];
  try {
    lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
  const entries: AuditEntry[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      const parsed = JSON.parse(line) as AuditEntry;
      if (parsed && typeof parsed.kind === "string") entries.push(parsed);
    } catch {
      /* skip malformed */
    }
  }
  return entries;
}

function truncate(detail: string): string {
  const clean = detail.replace(/\s+/g, " ").trim();
  return clean.length > MAX_DETAIL ? `${clean.slice(0, MAX_DETAIL)}…` : clean;
}
