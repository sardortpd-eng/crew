import {
  clearCustomPresets,
  isBuiltinName,
  listPresets,
  parsePreset,
  registerPreset,
  unregisterPreset,
} from "../engine/presets.ts";
import type { PresetOp } from "./commands.ts";
import { loadCustomPresets, persistPreset, removePersistedPreset } from "./presetStore.ts";

const MAX_DESCRIPTION = 60;

/** Loads custom presets into the registry at startup. Returns a status notice. */
export function loadStartupPresets(cwd: string): string | undefined {
  const { presets, warnings } = loadCustomPresets(cwd);
  presets.forEach(registerPreset);
  if (warnings.length > 0) return warnings.join("\n");
  if (presets.length > 0) return `Loaded ${presets.length} custom preset(s).`;
  return undefined;
}

/** Executes a `/preset` operation against the registry + config files. */
export function handlePresetOp(op: PresetOp, cwd: string): string {
  switch (op.type) {
    case "list":
      return formatList();
    case "reload":
      return reload(cwd);
    case "remove":
      return remove(op.name);
    case "new":
      return create(op);
  }
}

function formatList(): string {
  const lines = listPresets().map(({ preset, builtin }) => {
    const tag = builtin ? "" : " *";
    return `  ${preset.name}${tag}  ·  ${preset.model}/${preset.permissionMode}  ·  [${preset.allowedTools.join(", ")}]`;
  });
  return ["Presets (* = custom):", ...lines].join("\n");
}

function reload(cwd: string): string {
  clearCustomPresets();
  const { presets, warnings } = loadCustomPresets(cwd);
  presets.forEach(registerPreset);
  const base = `Reloaded ${presets.length} custom preset(s).`;
  return warnings.length > 0 ? `${base}\n${warnings.join("\n")}` : base;
}

function remove(name: string): string {
  if (isBuiltinName(name)) return `"${name}" is built-in and can't be removed.`;
  if (!unregisterPreset(name)) return `No custom preset "${name}".`;
  try {
    removePersistedPreset(name);
  } catch (error) {
    return `Removed "${name}" for this session (config not updated: ${message(error)}).`;
  }
  return `Removed preset "${name}".`;
}

function create(op: Extract<PresetOp, { type: "new" }>): string {
  if (isBuiltinName(op.name)) {
    return `"${op.name}" is a built-in preset — choose a different name.`;
  }

  const parsed = parsePreset({
    name: op.name,
    description: deriveDescription(op.prompt),
    model: op.model,
    systemPrompt: op.prompt,
    allowedTools: op.tools,
    permissionMode: op.mode,
  });

  if (!parsed.ok) return `Invalid preset — ${parsed.error}`;

  registerPreset(parsed.preset);
  try {
    persistPreset(parsed.preset);
  } catch (error) {
    return `Created "${op.name}" for this session (not saved: ${message(error)}). /spawn ${op.name}`;
  }
  return `Created preset "${op.name}". Use /spawn ${op.name}`;
}

function deriveDescription(prompt: string): string {
  const firstSentence = prompt.split(/(?<=[.!?])\s/)[0]?.trim() ?? prompt.trim();
  return firstSentence.length > MAX_DESCRIPTION
    ? `${firstSentence.slice(0, MAX_DESCRIPTION)}…`
    : firstSentence;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
