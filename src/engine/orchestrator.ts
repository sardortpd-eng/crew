import type { CanUseTool, PermissionMode, SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { AgentSession } from "./agentSession.ts";
import { subscriptionEnv } from "./env.ts";
import type { Preset } from "./presets.ts";
import type { McpServerConfig, Options, QueryFn } from "./types.ts";

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
};

/**
 * A spawned agent: its session controller plus the preset it was cloned from.
 */
export type SpawnedAgent = {
  readonly id: string;
  readonly preset: Preset;
  readonly session: AgentSession;
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
    return {
      model: preset.model,
      systemPrompt: preset.systemPrompt,
      allowedTools: [...preset.allowedTools],
      permissionMode,
      ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
      includePartialMessages: true,
      ...(this.config.cwd ? { cwd: this.config.cwd } : {}),
      ...(this.config.makeCanUseTool ? { canUseTool: this.config.makeCanUseTool(agent) } : {}),
      ...(this.config.mcpServers && Object.keys(this.config.mcpServers).length > 0
        ? { mcpServers: { ...this.config.mcpServers } }
        : {}),
      ...(this.config.settingSources ? { settingSources: [...this.config.settingSources] } : {}),
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
