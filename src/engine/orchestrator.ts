import type { CanUseTool, PermissionMode, SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { AgentSession } from "./agentSession.ts";
import { subscriptionEnv } from "./env.ts";
import { createGuardrailHooks } from "./guardrailHook.ts";
import type { Preset } from "./presets.ts";
import type { McpServerConfig, Options, QueryFn, SdkPluginConfig } from "./types.ts";

export type OrchestratorConfig = {
  readonly queryFn: QueryFn;
  readonly cwd?: string;
  /** Builds a per-agent permission handler so prompts carry agent context. */
  readonly makeCanUseTool?: (agent: SpawnedAgent) => CanUseTool;
  /** MCP servers made available to every agent. */
  readonly mcpServers?: Readonly<Record<string, McpServerConfig>>;
  /** Filesystem settings to load (CLAUDE.md, project `.mcp.json`, etc.). */
  readonly settingSources?: readonly SettingSource[];
  /**
   * Session-wide permission-mode override (the safety toggle). Returns undefined
   * to use each preset's own mode. Read at send time so it always reflects the
   * current toggle.
   */
  readonly resolvePermissionMode?: () => PermissionMode | undefined;
  /**
   * Session-wide model override. Returns undefined to use each preset's own
   * model. Read at send time so it always reflects the current toggle.
   */
  readonly resolveModel?: () => string | undefined;
  /** Per-turn budget caps (USD / turns), read at send time. */
  readonly resolveBudget?: () => { maxBudgetUsd?: number; maxTurns?: number };
  /**
   * Local plugins (installed from git) made available to every agent. Read at
   * send time so a freshly-installed plugin applies on the next turn — no
   * respawn — since each turn builds a fresh `query()` with `resume`.
   */
  readonly resolvePlugins?: () => readonly SdkPluginConfig[];
};

/**
 * A spawned agent: its session controller plus the preset it was cloned from.
 */
export type SpawnedAgent = {
  readonly id: string;
  readonly preset: Preset;
  readonly session: AgentSession;
  /** Per-agent working directory (a git worktree); falls back to config.cwd. */
  cwd?: string;
};

/**
 * Owns N concurrent {@link AgentSession}s. Each session is an independent SDK
 * conversation, so agents run truly in parallel. The orchestrator never
 * duplicates agent/server state — it only tracks the live session handles.
 */
export class Orchestrator {
  private readonly agents = new Map<string, SpawnedAgent>();
  private readonly config: OrchestratorConfig;
  private counter = 0;

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  /** Creates a new agent from a preset. Does not start a turn. */
  spawn(preset: Preset): SpawnedAgent {
    const id = this.nextId(preset.name);
    const session = new AgentSession(id, this.config.queryFn);
    const agent: SpawnedAgent = { id, preset, session };
    this.agents.set(id, agent);
    this.counter = Math.max(this.counter, idCounter(id, preset.name));
    return agent;
  }

  /**
   * Recreates an agent from a saved session: reuses its id and pre-loads the
   * SDK `sessionId` so the next turn resumes the prior conversation.
   */
  restore(id: string, preset: Preset, sessionId?: string): SpawnedAgent {
    const session = new AgentSession(id, this.config.queryFn);
    if (sessionId) session.sessionId = sessionId;
    const agent: SpawnedAgent = { id, preset, session };
    this.agents.set(id, agent);
    this.counter = Math.max(this.counter, idCounter(id, preset.name));
    return agent;
  }

  /** Routes a prompt to a single agent and runs one turn. */
  async send(id: string, prompt: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Unknown agent: ${id}`);
    await agent.session.run(prompt, this.buildOptions(agent));
  }

  /**
   * Sends the same prompt to every agent in parallel. Returns when all turns
   * settle; individual failures surface via each session's `error` event.
   */
  async broadcast(prompt: string): Promise<void> {
    const runs = [...this.agents.values()].map((agent) =>
      agent.session.run(prompt, this.buildOptions(agent)),
    );
    await Promise.allSettled(runs);
  }

  /** Points an agent at a working directory (e.g. its git worktree). */
  setAgentCwd(id: string, cwd: string): void {
    const agent = this.agents.get(id);
    if (agent) agent.cwd = cwd;
  }

  /** Aborts one agent's in-flight turn. */
  stop(id: string): void {
    this.agents.get(id)?.session.stop();
  }

  /** Aborts every agent's in-flight turn. */
  stopAll(): void {
    for (const agent of this.agents.values()) agent.session.stop();
  }

  /** Removes an agent after stopping it. */
  remove(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.session.stop();
    agent.session.removeAllListeners();
    this.agents.delete(id);
  }

  get(id: string): SpawnedAgent | undefined {
    return this.agents.get(id);
  }

  list(): SpawnedAgent[] {
    return [...this.agents.values()];
  }

  /** Builds immutable SDK options from an agent's preset (no preset mutation). */
  private buildOptions(agent: SpawnedAgent): Options {
    const { preset } = agent;
    // The session-wide safety toggle overrides the preset's mode when set.
    const permissionMode = this.config.resolvePermissionMode?.() ?? preset.permissionMode;
    const cwd = agent.cwd ?? this.config.cwd; // a worktree, or the shared root
    const plugins = this.config.resolvePlugins?.() ?? [];
    return {
      // The session-wide override wins over the preset's own model when set.
      model: this.config.resolveModel?.() ?? preset.model,
      systemPrompt: preset.systemPrompt,
      allowedTools: [...preset.allowedTools],
      permissionMode,
      ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
      // Always-on safety net: blocks destructive shell even in bypass mode.
      hooks: createGuardrailHooks(),
      ...(this.config.resolveBudget?.() ?? {}),
      includePartialMessages: true,
      ...(cwd ? { cwd } : {}),
      ...(this.config.makeCanUseTool ? { canUseTool: this.config.makeCanUseTool(agent) } : {}),
      ...(this.config.mcpServers && Object.keys(this.config.mcpServers).length > 0
        ? { mcpServers: { ...this.config.mcpServers } }
        : {}),
      ...(this.config.settingSources ? { settingSources: [...this.config.settingSources] } : {}),
      ...(plugins.length > 0 ? { plugins: [...plugins] } : {}),
      // Force subscription OAuth: never let a stray API key route to metered
      // billing. process.env minus ANTHROPIC_API_KEY.
      env: subscriptionEnv(),
    };
  }

  private nextId(presetName: string): string {
    this.counter += 1;
    return `${presetName}-${this.counter}`;
  }
}

/** Extracts the numeric suffix from an id like `coder-3` (0 if absent). */
function idCounter(id: string, presetName: string): number {
  const n = Number.parseInt(id.slice(presetName.length + 1), 10);
  return Number.isFinite(n) ? n : 0;
}
