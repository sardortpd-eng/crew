import { query } from "@anthropic-ai/claude-agent-sdk";
import { useRef } from "react";
import { Orchestrator, type SpawnedAgent } from "../engine/orchestrator.ts";
import { getPreset, isBuilderPreset, listPresets, presetNames } from "../engine/presets.ts";
import { routePrompt } from "../engine/router.ts";
import { VerifyController } from "../engine/verifyController.ts";
import { HELP_TEXT, parseCommand } from "../lib/commands.ts";
import { loadMcpConfig } from "../lib/mcpConfig.ts";
import { createPermissionHandler } from "../lib/permissions.ts";
import { handlePresetOp, loadStartupPresets } from "../lib/presetCommands.ts";
import { useStore } from "../state/store.ts";

/** Result of handling one input line. */
export type InputResult = {
  readonly quit?: boolean;
  readonly notice?: string;
};

/**
 * Owns the orchestrator for the app's lifetime, wires each spawned agent's
 * session events into the Zustand store, and turns input lines into actions.
 */
export function useCrew(cwd: string) {
  const orchestratorRef = useRef<Orchestrator | null>(null);
  const verifyRef = useRef<VerifyController | null>(null);
  const autoVerifyRef = useRef<boolean>(true);
  const routingRef = useRef<boolean>(false);
  const mcpServersRef = useRef<readonly string[]>([]);
  const startupNoticeRef = useRef<string | undefined>(undefined);

  if (orchestratorRef.current === null) {
    const mcp = loadMcpConfig(cwd);
    mcpServersRef.current = Object.keys(mcp.mcpServers);
    startupNoticeRef.current = joinNotices(loadStartupPresets(cwd), mcpStartupNotice(mcp));
    orchestratorRef.current = new Orchestrator({
      queryFn: query,
      cwd,
      mcpServers: mcp.mcpServers,
      settingSources: mcp.settingSources,
      makeCanUseTool: (agent) =>
        createPermissionHandler({
          allowedTools: [], // preset allowlist is enforced by the SDK; gate the rest
          requestApproval: ({ toolName, input }) =>
            new Promise<boolean>((resolve) => {
              useStore.getState().addPermissionRequest({
                id: `${agent.id}:${toolName}:${Date.now()}`,
                agentId: agent.id,
                toolName,
                input,
                resolve,
              });
            }),
        }),
    });
  }

  const orchestrator = orchestratorRef.current;

  if (verifyRef.current === null) {
    verifyRef.current = new VerifyController({
      cwd,
      send: (agentId, prompt) => orchestrator.send(agentId, prompt),
      onState: (agentId, state) => useStore.getState().setVerify(agentId, state),
    });
  }
  const verifier = verifyRef.current;

  function wire(agent: SpawnedAgent): void {
    const { id, session } = agent;
    const store = useStore.getState();
    session.on("status", (status) => store.setStatus(id, status));
    session.on("delta", (text) => store.appendDelta(id, text));
    session.on("text", (text) => store.appendDelta(id, text));
    session.on("tool", (tool) => store.addToolBlock(id, tool));
    session.on("result", (text) => {
      store.finalizeTurn(id, text);
      maybeVerify(agent);
    });
    session.on("usage", (snapshot) => store.addUsage(id, snapshot));
    session.on("toolResult", (r) => store.setToolResult(r.toolUseId, r.summary));
    session.on("account", (info) => store.setAccount(info));
    session.on("mcp", (servers) => store.setMcpStatus(servers));
    session.on("error", (error) => {
      store.addError(id, error.message);
      store.finalizeTurn(id, "");
    });
  }

  /** Auto-verify a builder agent after a user turn (not during a fix turn). */
  function maybeVerify(agent: SpawnedAgent): void {
    if (!autoVerifyRef.current) return;
    if (!isBuilderPreset(agent.preset)) return;
    if (verifier.isVerifying(agent.id)) return;
    verifier.enqueue(agent.id);
  }

  function spawn(presetName: string, task?: string): InputResult {
    const preset = getPreset(presetName);
    if (!preset) {
      return { notice: `Unknown preset "${presetName}". Try: ${presetNames().join(", ")}` };
    }
    const agent = orchestrator.spawn(preset);
    wire(agent);
    useStore.getState().addAgent(agent.id, preset.name);
    useStore.getState().focus(agent.id);
    autoView();
    if (task) sendTo(agent.id, task);
    return { notice: `Spawned ${agent.id}${task ? ` · running task` : ""}` };
  }

  /** Auto-promote to grid at 2+ agents, demote to focus at ≤1 (unless locked). */
  function autoView(): void {
    const count = useStore.getState().agents.length;
    useStore.getState().autoViewMode(count >= 2 ? "grid" : "focus");
  }

  function sendTo(id: string, prompt: string): void {
    useStore.getState().addUserMessage(id, prompt);
    void orchestrator.send(id, prompt).catch((error: unknown) => {
      useStore.getState().addError(id, error instanceof Error ? error.message : String(error));
    });
  }

  function broadcast(task: string): InputResult {
    const agents = useStore.getState().agents;
    if (agents.length === 0) return { notice: "No agents to broadcast to. /spawn one first." };
    for (const a of agents) useStore.getState().addUserMessage(a.id, task);
    void orchestrator.broadcast(task);
    return { notice: `Broadcast to ${agents.length} agent(s)` };
  }

  /** Classifies a prompt and assigns it to the best agent (reuse, else spawn). */
  async function route(prompt: string): Promise<void> {
    if (routingRef.current) {
      useStore.getState().setRouterStatus("↳ still assigning — one moment…");
      return; // a route is already in flight; don't spawn a duplicate
    }
    routingRef.current = true;
    useStore.getState().setRouterStatus("↳ assigning an agent…");
    try {
      const decision = await routePrompt(prompt, listPresets(), { queryFn: query });
      const store = useStore.getState(); // re-read: state may have changed across the await
      const existing = store.agents.find((a) => a.presetName === decision.preset);
      if (existing) {
        store.focus(existing.id);
        autoView();
        sendTo(existing.id, prompt);
      } else {
        spawn(decision.preset, prompt);
      }
      useStore.getState().setRouterStatus(`↳ ${decision.preset} · ${decision.reason}`);
    } catch (error) {
      useStore
        .getState()
        .setRouterStatus(
          `↳ routing failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
      routingRef.current = false;
    }
  }

  function resolveId(target?: string): string | undefined {
    const agents = useStore.getState().agents;
    if (!target) return useStore.getState().focusedAgentId ?? undefined;
    const asIndex = Number.parseInt(target, 10);
    if (!Number.isNaN(asIndex) && asIndex >= 1 && asIndex <= agents.length) {
      return agents[asIndex - 1]?.id;
    }
    return agents.find((a) => a.id === target)?.id;
  }

  function handleInput(raw: string): InputResult {
    const command = parseCommand(raw);
    switch (command.kind) {
      case "message": {
        if (command.text.length === 0) return {};
        const id = useStore.getState().focusedAgentId;
        if (id) {
          useStore.getState().setRouterStatus(null);
          sendTo(id, command.text); // continue the focused conversation
        } else {
          void route(command.text); // no focus → auto-assign the best agent
        }
        return {};
      }
      case "route":
        void route(command.prompt);
        return {};
      case "mcp":
        return { notice: describeMcp(mcpServersRef.current) };
      case "spawn":
        return spawn(command.preset, command.task);
      case "broadcast":
        return broadcast(command.task);
      case "stop": {
        const id = resolveId(command.id);
        if (!id) return { notice: "No agent to stop." };
        orchestrator.stop(id);
        verifier.cancel(id);
        return { notice: `Stopped ${id}` };
      }
      case "remove": {
        const id = resolveId(command.id);
        if (!id) return { notice: "No agent to remove." };
        verifier.remove(id);
        orchestrator.remove(id);
        useStore.getState().removeAgent(id);
        autoView();
        return { notice: `Removed ${id}` };
      }
      case "focus": {
        const id = resolveId(command.target);
        if (!id) return { notice: `No agent matching "${command.target}".` };
        useStore.getState().focus(id);
        return {};
      }
      case "preset":
        return { notice: handlePresetOp(command.op, cwd) };
      case "view": {
        const store = useStore.getState();
        if (command.mode) store.setViewMode(command.mode);
        else store.toggleViewMode();
        return { notice: `View: ${useStore.getState().viewMode}` };
      }
      case "verify": {
        if (command.toggle) {
          autoVerifyRef.current = command.toggle === "on";
          return { notice: `Auto-verify ${command.toggle}` };
        }
        const id = resolveId(command.id);
        if (!id) return { notice: "No agent to verify." };
        verifier.enqueue(id);
        return { notice: `Verifying ${id}…` };
      }
      case "help":
        return { notice: HELP_TEXT };
      case "quit":
        return { quit: true };
      case "error":
        return { notice: command.message };
    }
  }

  /** Aborts the focused agent's in-flight turn (esc-to-interrupt). */
  function interrupt(): void {
    const id = useStore.getState().focusedAgentId;
    if (id) {
      orchestrator.stop(id);
      verifier.cancel(id);
    }
  }

  return { handleInput, interrupt, startupNotice: startupNoticeRef.current };
}

/** Joins non-empty startup notices onto separate lines. */
function joinNotices(...parts: Array<string | undefined>): string | undefined {
  const lines = parts.filter((p): p is string => Boolean(p));
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/** Startup notice for loaded MCP servers / config warnings. */
function mcpStartupNotice(mcp: ReturnType<typeof loadMcpConfig>): string | undefined {
  const count = Object.keys(mcp.mcpServers).length;
  const base = count > 0 ? `Loaded ${count} MCP server(s).` : undefined;
  if (mcp.warnings.length > 0) return joinNotices(base, ...mcp.warnings);
  return base;
}

/** Renders `/mcp`: configured servers + their last-seen connection status. */
function describeMcp(configured: readonly string[]): string {
  const live = useStore.getState().mcpStatus;
  if (configured.length === 0 && live.length === 0) {
    return "No MCP servers configured. Add them to .crew/mcp.json (or set settingSources).";
  }
  const statusOf = (name: string) =>
    live.find((s) => s.name === name)?.status ?? "not yet connected";
  const names = configured.length > 0 ? configured : live.map((s) => s.name);
  const lines = names.map((name) => `  ${name} — ${statusOf(name)}`);
  return ["MCP servers:", ...lines].join("\n");
}
