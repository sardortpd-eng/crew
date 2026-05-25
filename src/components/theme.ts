import type { AgentStatus } from "../engine/types.ts";
import type { VerifyState } from "../state/store.ts";

/** Claude Code's warm coral accent. */
export const ACCENT = "#D97757";

/** Glyph for a verify status: running / passed / failed. */
export function verifyGlyph(status: VerifyState["status"]): string {
  switch (status) {
    case "running":
      return "⟳";
    case "passed":
      return "✓";
    case "failed":
      return "✗";
    default:
      return "";
  }
}

/** Color for a verify status. */
export function verifyColor(status: VerifyState["status"]): string {
  switch (status) {
    case "passed":
      return "green";
    case "failed":
      return "red";
    case "running":
      return ACCENT;
    default:
      return "gray";
  }
}

/** Spinner frames matching Claude Code's animated star glyph. */
export const SPINNER_FRAMES = ["✶", "✸", "✺", "✹", "✷", "✸"] as const;

/** Whether a status means the agent is actively working. */
export function isBusy(status: AgentStatus): boolean {
  return status === "thinking" || status === "running-tool";
}

/** Status-dot color. */
export function statusColor(status: AgentStatus): string {
  switch (status) {
    case "thinking":
      return ACCENT;
    case "running-tool":
      return "cyan";
    case "done":
      return "green";
    case "error":
      return "red";
    default:
      return "gray"; // idle, stopped
  }
}

/** Human-readable status label. */
export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "running-tool":
      return "Running tool";
    case "thinking":
      return "Thinking";
    default:
      return status;
  }
}
