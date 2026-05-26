import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { SAFETY_MODES } from "../state/store.ts";

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  preset: z.string(),
  status: z.enum(["todo", "active", "done", "failed"]),
});

const agentSchema = z.object({
  id: z.string(),
  presetName: z.string(),
  sessionId: z.string().optional(),
});

const snapshotSchema = z.object({
  agents: z.array(agentSchema),
  tasks: z.array(taskSchema),
  focusedAgentId: z.string().nullable().optional(),
  safetyMode: z.enum(SAFETY_MODES).optional(),
});

/** A restorable snapshot of a crew session (per project directory). */
export type SessionSnapshot = z.infer<typeof snapshotSchema>;

/** Per-project session file (gitignored via `.crew/`). */
export function sessionPath(cwd: string): string {
  return join(cwd, ".crew", "session.json");
}

/** Writes a snapshot to `.crew/session.json`. */
export function saveSession(cwd: string, snapshot: SessionSnapshot): void {
  const path = sessionPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

/** Loads + validates the saved snapshot, or null if absent/invalid. */
export function loadSession(cwd: string): SessionSnapshot | null {
  const path = sessionPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const result = snapshotSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Deletes the saved session, if any. */
export function forgetSession(cwd: string): boolean {
  const path = sessionPath(cwd);
  if (!existsSync(path)) return false;
  try {
    writeFileSync(path, JSON.stringify({ agents: [], tasks: [] }, null, 2));
    return true;
  } catch {
    return false;
  }
}
