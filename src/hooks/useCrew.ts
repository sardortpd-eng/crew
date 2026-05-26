import { query } from "@anthropic-ai/claude-agent-sdk";
import { useRef } from "react";
import { CheckpointController } from "../engine/checkpointController.ts";
import { Orchestrator, type SpawnedAgent } from "../engine/orchestrator.ts";
import { planGoal } from "../engine/planner.ts";
import {
  getPreset,
  isBuilderPreset,
  listPresets,
  type Preset,
  presetNames,
} from "../engine/presets.ts";
import { routePrompt } from "../engine/router.ts";
import { VerifyController } from "../engine/verifyController.ts";
import { HELP_TEXT, parseCommand } from "../lib/commands.ts";
import { loadMcpConfig } from "../lib/mcpConfig.ts";
import { createPermissionHandler } from "../lib/permissions.ts";
import { handlePresetOp, loadStartupPresets } from "../lib/presetCommands.ts";
import {
  forgetSession,
  loadSession,
  saveSession,
  type SessionSnapshot,
} from "../lib/sessionStore.ts";
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
  const checkpointRef = useRef<CheckpointController | null>(null);
  const autoVerifyRef = useRef<boolean>(true);
  const routingRef = useRef<boolean>(false);
  const planRunningRef = useRef<boolean>(false);
  const planAbortRef = useRef<boolean>(false);
  const restoredRef = useRef<boolean>(false);
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
      // Session-wide safety toggle: "normal" → each preset decides; else override.
      resolvePermissionMode: () => {
        const mode = useStore.getState().safetyMode;
        return mode === "normal" ? undefined : mode;
      },
      resolveBudget: () => {
        const usd = useStore.getState().perTurnBudgetUsd;
        return usd ? { maxBudgetUsd: usd } : {};
      },
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

  if (checkpointRef.current === null) {
    checkpointRef.current = new CheckpointController({
      cwd,
      onChange: (branch, checkpoints) => useStore.getState().setCheckpoints(branch, checkpoints),
    });
  }
  const checkpoints = checkpointRef.current;

  if (verifyRef.current === null) {
    verifyRef.current = new VerifyController({
      cwd,
      send: (agentId, prompt) => orchestrator.send(agentId, prompt),
      onState: (agentId, state) => {
        useStore.getState().setVerify(agentId, state);
        // Commit-on-green: a passing verify is a durable checkpoint.
        if (state.status === "passed") void commitOnGreen(agentId);
      },
    });
  }
  const verifier = verifyRef.current;

  // Restore a saved crew + board for this folder, then keep autosaving (once).
  if (!restoredRef.current) {
    restoredRef.current = true;
    startupNoticeRef.current = joinNotices(startupNoticeRef.current, restoreSession());
    setupAutosave();
  }

  function snapshotForSave(): SessionSnapshot {
    const st = useStore.getState();
    return {
      agents: st.agents.map((a) => ({
        id: a.id,
        presetName: a.presetName,
        ...(a.sessionId ? { sessionId: a.sessionId } : {}),
      })),
      tasks: [...st.tasks],
      focusedAgentId: st.focusedAgentId,
      safetyMode: st.safetyMode,
    };
  }

  /** Recreates the agents + board from the last saved session for this folder. */
  function restoreSession(): string | undefined {
    const snap = loadSession(cwd);
    if (!snap) return undefined;

    let restored = 0;
    for (const a of snap.agents) {
      const preset = getPreset(a.presetName);
      if (!preset) continue;
      const agent = orchestrator.restore(a.id, preset, a.sessionId);
      wire(agent);
      useStore.getState().addAgent(a.id, preset.name);
      if (a.sessionId) useStore.getState().setSessionId(a.id, a.sessionId);
      restored += 1;
    }
    if (snap.tasks.length > 0) useStore.getState().setTasks(snap.tasks);
    if (snap.focusedAgentId) useStore.getState().focus(snap.focusedAgentId);
    if (snap.safetyMode) useStore.getState().setSafetyMode(snap.safetyMode);
    autoView();

    if (restored === 0 && snap.tasks.length === 0) return undefined;
    const taskNote = snap.tasks.length > 0 ? ` + ${snap.tasks.length} task(s)` : "";
    return `Restored ${restored} agent(s)${taskNote} — message one to resume its context.`;
  }

  /** Debounced autosave of the session whenever the persisted slice changes. */
  function setupAutosave(): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastJson = "";
    useStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const snap = snapshotForSave();
        if (snap.agents.length === 0 && snap.tasks.length === 0) return;
        const json = JSON.stringify(snap);
        if (json === lastJson) return;
        lastJson = json;
        saveSession(cwd, snap);
      }, 800);
    });
  }

  /** Commits a checkpoint after a green turn, labeled with the agent's last task. */
  async function commitOnGreen(agentId: string): Promise<void> {
    const label = lastUserMessage(agentId) ?? "turn";
    const result = await checkpoints.checkpoint(agentId, label);
    if (result.ok) useStore.getState().setRouterStatus(result.message);
  }

  function lastUserMessage(agentId: string): string | undefined {
    const list = useStore.getState().messages[agentId] ?? [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const m = list[i];
      if (m?.role === "user") return m.text;
    }
    return undefined;
  }

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
    session.on("session", (sid) => store.setSessionId(id, sid));
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

  /** Spawns + wires + registers + focuses a new agent (no turn started). */
  function createAgent(preset: Preset): string {
    const agent = orchestrator.spawn(preset);
    wire(agent);
    useStore.getState().addAgent(agent.id, preset.name);
    useStore.getState().focus(agent.id);
    autoView();
    return agent.id;
  }

  /** Returns an existing agent of the preset, or spawns one. */
  function ensureAgent(preset: Preset): string {
    const existing = useStore.getState().agents.find((a) => a.presetName === preset.name);
    return existing ? existing.id : createAgent(preset);
  }

  function spawn(presetName: string, task?: string): InputResult {
    const preset = getPreset(presetName);
    if (!preset) {
      return { notice: `Unknown preset "${presetName}". Try: ${presetNames().join(", ")}` };
    }
    const id = createAgent(preset);
    if (task) sendTo(id, task);
    return { notice: `Spawned ${id}${task ? ` · running task` : ""}` };
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

  /** Decomposes a goal into an assigned task board (does not run it). */
  async function plan(goal: string): Promise<void> {
    useStore.getState().setRouterStatus("↳ planning…");
    const tasks = await planGoal(goal, listPresets(), { queryFn: query });
    useStore.getState().addTasks(tasks);
    useStore.getState().setRouterStatus(`↳ planned ${tasks.length} task(s) · /run to execute`);
  }

  /** Runs the task board one task at a time (safe under a shared working dir). */
  async function runPlan(): Promise<void> {
    if (planRunningRef.current) return;
    planRunningRef.current = true;
    planAbortRef.current = false;
    try {
      for (;;) {
        if (planAbortRef.current) break;
        const task = useStore.getState().tasks.find((t) => t.status === "todo");
        if (!task) break;

        const preset = getPreset(task.preset) ?? getPreset("coder");
        if (!preset) {
          useStore.getState().setTaskStatus(task.id, "failed");
          continue;
        }
        useStore.getState().setTaskStatus(task.id, "active");
        const id = ensureAgent(preset);
        await sendAndSettle(id, task.title);
        const status = useStore.getState().agents.find((a) => a.id === id)?.status;
        useStore.getState().setTaskStatus(task.id, status === "error" ? "failed" : "done");
      }
    } finally {
      planRunningRef.current = false;
      const done = useStore.getState().tasks.filter((t) => t.status === "done").length;
      const total = useStore.getState().tasks.length;
      useStore.getState().setRouterStatus(`↳ run complete · ${done}/${total} done`);
    }
  }

  /** Runs one turn and waits for any follow-on verify to settle (≤2 min). */
  async function sendAndSettle(id: string, prompt: string): Promise<void> {
    useStore.getState().addUserMessage(id, prompt);
    await orchestrator.send(id, prompt).catch(() => undefined);
    const start = Date.now();
    while (verifier.isVerifying(id) && Date.now() - start < 120_000) {
      await new Promise((r) => setTimeout(r, 200));
    }
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
      case "mode": {
        const store = useStore.getState();
        if (command.mode) store.setSafetyMode(command.mode);
        else store.cycleSafetyMode();
        return { notice: `Safety mode: ${useStore.getState().safetyMode}` };
      }
      case "checkpoint": {
        const label = command.label ?? "manual checkpoint";
        void checkpoints
          .checkpoint(useStore.getState().focusedAgentId ?? "crew", label)
          .then((r) => useStore.getState().setRouterStatus(r.message));
        return {};
      }
      case "undo":
        void checkpoints.undo().then((r) => useStore.getState().setRouterStatus(r.message));
        return {};
      case "diff":
        void checkpoints.diff().then((text) => useStore.getState().setRouterStatus(text));
        return {};
      case "plan":
        void plan(command.goal);
        return { notice: "Planning…" };
      case "run": {
        if (useStore.getState().tasks.some((t) => t.status === "todo")) {
          void runPlan();
          return { notice: "Running task board…" };
        }
        return { notice: "No todo tasks. /plan <goal> first." };
      }
      case "tasks":
        return { notice: describeTasks() };
      case "save":
        saveSession(cwd, snapshotForSave());
        return { notice: "Session saved." };
      case "forget":
        forgetSession(cwd);
        return { notice: "Saved session cleared for this folder." };
      case "budget": {
        if (command.usd === undefined) {
          const cur = useStore.getState().perTurnBudgetUsd;
          return {
            notice: cur ? `Per-turn budget: $${cur.toFixed(2)}` : "No per-turn budget set.",
          };
        }
        useStore.getState().setBudget(command.usd);
        return {
          notice: command.usd ? `Per-turn budget: $${command.usd.toFixed(2)}` : "Budget cleared.",
        };
      }
      case "spawn":
        return spawn(command.preset, command.task);
      case "broadcast":
        return broadcast(command.task);
      case "stop": {
        planAbortRef.current = true; // halt the task runner after the current task
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

const TASK_GLYPH: Record<string, string> = { todo: "☐", active: "▶", done: "✓", failed: "✗" };

/** Renders `/tasks`: the board as a checklist. */
function describeTasks(): string {
  const tasks = useStore.getState().tasks;
  if (tasks.length === 0) return "No tasks. /plan <goal> to create some.";
  const lines = tasks.map((t) => `  ${TASK_GLYPH[t.status] ?? "·"} [${t.preset}] ${t.title}`);
  return ["Task board:", ...lines].join("\n");
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
