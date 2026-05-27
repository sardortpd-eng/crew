/**
 * How crew handles auto-checkpoints (the commit it makes when an agent's work
 * passes verify). Kept here (not in the store) so the store, the command
 * parser, and the hook can all share the type without an import cycle.
 */

export type CheckpointMode = "ask" | "auto" | "off";

export const CHECKPOINT_MODES: readonly CheckpointMode[] = ["ask", "auto", "off"];

/** True if `value` is one of the checkpoint modes. */
export function isCheckpointMode(value: string): value is CheckpointMode {
  return (CHECKPOINT_MODES as readonly string[]).includes(value);
}

/**
 * Decides what an auto-checkpoint should do:
 * - `off`  → never checkpoint;
 * - `auto` → always commit silently;
 * - `ask`  → commit silently inside an automated batch (`/run`, `/lead`), else
 *            prompt the user (y/n) first.
 */
export function checkpointAction(
  mode: CheckpointMode,
  automated: boolean,
): "skip" | "ask" | "commit" {
  if (mode === "off") return "skip";
  if (mode === "auto" || automated) return "commit";
  return "ask";
}
