/**
 * Pure reasoning about a cloned plugin directory: what's inside, whether it's
 * usable, and whether crew must synthesize a manifest for the SDK to load it.
 * The filesystem probe happens elsewhere; this module only interprets it.
 */

/** A count of installable artifacts found in a cloned directory. */
export type PluginProbe = {
  /** `.claude-plugin/plugin.json` is present. */
  readonly hasManifest: boolean;
  /** Markdown slash commands under `commands/`. */
  readonly commands: number;
  /** Subagent definitions under `agents/`. */
  readonly agents: number;
  /** Skills (`skills/<name>/SKILL.md`). */
  readonly skills: number;
  /** An `.mcp.json` declaring MCP servers. */
  readonly hasMcp: boolean;
  /** A `hooks/hooks.json`. */
  readonly hasHooks: boolean;
};

export type PluginSummary = {
  /** Human-readable component list, e.g. ["3 commands", "1 skill", "MCP servers"]. */
  readonly components: readonly string[];
  /** No manifest and no installable content — nothing to load. */
  readonly isEmpty: boolean;
  /** Has content but no manifest, so one must be synthesized before loading. */
  readonly needsManifest: boolean;
};

/** The plugin-manifest version crew stamps onto synthesized manifests. */
const SYNTHETIC_VERSION = "0.0.0";

/** Interprets a {@link PluginProbe} into a usability summary. */
export function summarizePlugin(probe: PluginProbe): PluginSummary {
  const components = [
    plural(probe.commands, "command"),
    plural(probe.agents, "agent"),
    plural(probe.skills, "skill"),
    probe.hasMcp ? "MCP servers" : "",
    probe.hasHooks ? "hooks" : "",
  ].filter((c): c is string => c.length > 0);

  const hasContent = components.length > 0;
  return {
    components,
    isEmpty: !probe.hasManifest && !hasContent,
    needsManifest: !probe.hasManifest && hasContent,
  };
}

/** Minimal `.claude-plugin/plugin.json` body for a repo that ships without one. */
export function makeManifest(name: string): string {
  return JSON.stringify({ name, version: SYNTHETIC_VERSION }, null, 2);
}

/** "" when count is 0, else "<n> <noun>[s]". */
function plural(count: number, noun: string): string {
  if (count <= 0) return "";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
