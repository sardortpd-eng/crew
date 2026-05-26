import { query } from "@anthropic-ai/claude-agent-sdk";
import { readdirSync } from "node:fs";
import { useRef } from "react";
import { CheckpointController } from "../engine/checkpointController.ts";
import { Orchestrator, type SpawnedAgent } from "../engine/orchestrator.ts";
import { WorktreeController } from "../engine/worktrees.ts";
import { planGoal } from "../engine/planner.ts";
import {
  getPreset,
  isBuilderPreset,
  LEAD_PRESET,
  type Preset,
  presetNames,
  selectablePresets,
} from "../engine/presets.ts";
import { type AssignResult, createLeadServer } from "../engine/leadTools.ts";
import { routePrompt } from "../engine/router.ts";
import { taskOutcome } from "../lib/verifyDecision.ts";
import { VerifyController } from "../engine/verifyController.ts";
import { HELP_TEXT, parseCommand } from "../lib/commands.ts";
import { runGate } from "../engine/verifier.ts";
import { appendAudit, readAudit } from "../lib/auditLog.ts";
import { addMcpServer, loadMcpConfig, parseServerSpec } from "../lib/mcpConfig.ts";
import type { McpServerConfig } from "../engine/types.ts";
import { parseInstallArg } from "../lib/installSource.ts";
import { installFromGit, listInstalled, removeInstalled } from "../lib/installStore.ts";
import { loadShipConfig } from "../lib/projectGates.ts";
import { isGreenfield } from "../lib/repoState.ts";
import { aggregateTotals } from "../lib/headerStats.ts";
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

/** Cap on how many agents the lead may have on the team at once (bounded autonomy). */
const MAX_TEAM_AGENTS = 6;

/**
 * Owns the orchestrator for the app's lifetime, wires each spawned agent's
 * session events into the Zustand store, and turns input lines into actions.
 */
export function useCrew(cwd: string) {
  const orchestratorRef = useRef<Orchestrator | null>(null);
  const verifyRef = useRef<VerifyController | null>(null);
  const checkpointRef = useRef<CheckpointController | null>(null);
  const worktreeRef = useRef<WorktreeController | null>(null);
  const autoVerifyRef = useRef<boolean>(true);
  const routingRef = useRef<boolean>(false);
  const planRunningRef = useRef<boolean>(false);
  const planAbortRef = useRef<boolean>(false);
  const restoredRef = useRef<boolean>(false);
  const leadServerRef = useRef<boolean>(false);
  const mcpConfigRef = useRef<Record<string, McpServerConfig>>({});
  const startupNoticeRef = useRef<string | undefined>(undefined);

  if (orchestratorRef.current === null) {
    const mcp = loadMcpConfig(cwd);
    mcpConfigRef.current = { ...mcp.mcpServers };
    const installed = listInstalled(cwd);
    useStore.getState().setInstalledPlugins(installed);
    startupNoticeRef.current = joinNotices(
      loadStartupPresets(cwd),
      mcpStartupNotice(mcp),
      installedStartupNotice(installed),
    );
    orchestratorRef.current = new Orchestrator({
      queryFn: query,
      cwd,
      // Read live so a `/mcp add` applies on the next turn (no restart).
      resolveMcpServers: () => mcpConfigRef.current,
      settingSources: mcp.settingSources,
      // Session-wide safety toggle: "normal" → each preset decides; else override.
      resolvePermissionMode: () => {
        const mode = useStore.getState().safetyMode;
        return mode === "normal" ? undefined : mode;
      },
      // Session-wide model override (null → each preset keeps its own model).
      resolveModel: () => useStore.getState().modelOverride ?? undefined,
      resolveBudget: () => {
        const usd = useStore.getState().perTurnBudgetUsd;
        return usd ? { maxBudgetUsd: usd } : {};
      },
      // Installed plugins go live on the next turn (each turn is a fresh query).
      resolvePlugins: () =>
        useStore.getState().installedPlugins.map((p) => ({ type: "local", path: p.path })),
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
                resolve: (allow) => {
                  void appendAudit(cwd, {
                    kind: "permission",
                    agentId: agent.id,
                    detail: `${allow ? "allow" : "deny"} ${toolName}`,
                  });
                  resolve(allow);
                },
              });
            }),
        }),
    });
  }

  const orchestrator = orchestratorRef.current;

  // Give the lead agent its crew-control tools (spawn/assign/verify), once.
  if (!leadServerRef.current) {
    leadServerRef.current = true;
    orchestrator.setLeadServer(
      createLeadServer({ listTeam, assign: assignToSpecialist, verify: verifyForLead }),
    );
  }

  /** Appends an entry to the project's audit trail (best-effort). */
  function logAudit(kind: string, agentId?: string, detail?: string): void {
    void appendAudit(cwd, { kind, agentId, detail });
  }

  if (checkpointRef.current === null) {
    checkpointRef.current = new CheckpointController({
      cwd,
      onChange: (branch, checkpoints) => useStore.getState().setCheckpoints(branch, checkpoints),
    });
  }
  const checkpoints = checkpointRef.current;

  if (worktreeRef.current === null) {
    worktreeRef.current = new WorktreeController({ repoRoot: cwd });
  }
  const worktrees = worktreeRef.current;

  /** Acquires an isolated worktree for a builder agent on first use (when on). */
  async function ensureWorktree(id: string): Promise<void> {
    if (!useStore.getState().worktreesOn) return;
    if (worktrees.has(id)) return;
    const agent = orchestrator.get(id);
    if (!agent || !isBuilderPreset(agent.preset)) return;
    const path = await worktrees.acquire(id);
    if (path) {
      orchestrator.setAgentCwd(id, path);
      logAudit("worktree", id, `acquired ${path}`);
    }
  }

  if (verifyRef.current === null) {
    verifyRef.current = new VerifyController({
      cwd,
      send: (agentId, prompt) => orchestrator.send(agentId, prompt),
      onState: (agentId, state) => {
        useStore.getState().setVerify(agentId, state);
        if (state.status === "passed" || state.status === "failed") {
          logAudit("verify", agentId, `${state.status}${state.gate ? ` (${state.gate})` : ""}`);
        }
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
    // A worktree agent checkpoints on its own branch; otherwise the shared crew branch.
    const result = worktrees.has(agentId)
      ? await worktrees.checkpoint(agentId, label)
      : await checkpoints.checkpoint(agentId, label);
    if (result.ok) {
      useStore.getState().setRouterStatus(result.message);
      logAudit("checkpoint", agentId, result.message);
    }
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
    session.on("tool", (tool) => {
      store.addToolBlock(id, tool);
      logAudit("tool", id, `${tool.name} ${JSON.stringify(tool.input)}`);
    });
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
      logAudit("error", id, error.message);
    });
  }

  /** Auto-verify a builder agent after a user turn (not during a fix turn). */
  function maybeVerify(agent: SpawnedAgent): void {
    if (!autoVerifyRef.current) return;
    if (!isBuilderPreset(agent.preset)) return;
    if (verifier.isVerifying(agent.id)) return;
    verifier.enqueue(agent.id);
  }

  /** Spawns + wires + registers a new agent (no turn started). Focuses by default. */
  function createAgent(preset: Preset, opts: { focus?: boolean } = {}): string {
    const agent = orchestrator.spawn(preset);
    wire(agent);
    useStore.getState().addAgent(agent.id, preset.name);
    if (opts.focus !== false) useStore.getState().focus(agent.id);
    autoView();
    logAudit("spawn", agent.id, preset.name);
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
    logAudit("message", id, prompt);
    void (async () => {
      await ensureWorktree(id); // isolate builders before their first turn (if enabled)
      await orchestrator.send(id, prompt).catch((error: unknown) => {
        useStore.getState().addError(id, error instanceof Error ? error.message : String(error));
      });
    })();
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
    let greenfield = false;
    try {
      greenfield = isGreenfield(readdirSync(cwd));
    } catch {
      greenfield = false;
    }
    const tasks = await planGoal(goal, selectablePresets(), { queryFn: query, greenfield });
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
        const cap = useStore.getState().sessionBudgetUsd;
        if (cap !== null && aggregateTotals(useStore.getState().stats).cost >= cap) {
          useStore
            .getState()
            .setRouterStatus(`↳ session budget $${cap.toFixed(2)} reached — paused`);
          logAudit("budget", undefined, `session cap $${cap} reached — paused run`);
          break;
        }
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

        const st = useStore.getState();
        const outcome = taskOutcome(
          st.agents.find((a) => a.id === id)?.status === "error",
          st.verify[id]?.status,
        );
        st.setTaskStatus(task.id, outcome);
        if (outcome === "failed") {
          // Don't cascade broken state — pause so the user can fix, then /run resumes.
          logAudit("plan", id, `paused: ${task.title}`);
          break;
        }
      }
    } finally {
      planRunningRef.current = false;
      const tasks = useStore.getState().tasks;
      const done = tasks.filter((t) => t.status === "done").length;
      const failed = tasks.find((t) => t.status === "failed");
      const remaining = tasks.some((t) => t.status === "todo");
      useStore
        .getState()
        .setRouterStatus(
          failed && remaining
            ? `↳ paused: a task failed verify (${done}/${tasks.length} done) — fix & /run to resume`
            : `↳ run complete · ${done}/${tasks.length} done`,
        );
    }
  }

  /** Runs the configured deploy (+ health) command — the final ship gate. */
  async function ship(): Promise<void> {
    const { deploy, health } = loadShipConfig(cwd);
    const setStatus = (msg: string) => useStore.getState().setRouterStatus(msg);
    if (!deploy) {
      setStatus("No deploy command — set `deploy` in .crew/verify.json");
      return;
    }
    logAudit("ship", undefined, "start");
    const signal = new AbortController().signal;

    const dep = await runGate({ name: "deploy", command: deploy }, cwd, signal);
    if (!dep.passed) {
      logAudit("ship", undefined, `deploy failed (exit ${dep.exitCode})`);
      setStatus(`✗ deploy failed (exit ${dep.exitCode})`);
      return;
    }
    if (health) {
      const h = await runGate({ name: "health", command: health }, cwd, signal);
      if (!h.passed) {
        logAudit("ship", undefined, "health check failed");
        setStatus("✗ shipped but health check failed");
        return;
      }
    }
    logAudit("ship", undefined, "shipped");
    setStatus("✓ shipped");
  }

  /** Runs one turn and waits for any follow-on verify to settle (≤2 min). */
  async function sendAndSettle(id: string, prompt: string): Promise<void> {
    useStore.getState().addUserMessage(id, prompt);
    logAudit("message", id, prompt);
    await ensureWorktree(id);
    await orchestrator.send(id, prompt).catch(() => undefined);
    const start = Date.now();
    while (verifier.isVerifying(id) && Date.now() - start < 120_000) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // --- Lead orchestration: the crew-control tools the lead agent calls. ---

  /** The specialists the lead may hire + the agents currently on the team. */
  function listTeam() {
    const state = useStore.getState();
    return {
      presets: selectablePresets().map((p) => ({
        name: p.preset.name,
        description: p.preset.description,
      })),
      agents: state.agents.map((a) => ({ id: a.id, preset: a.presetName, status: a.status })),
    };
  }

  /** Spawn-or-reuse a specialist, run the task to completion, return its output. */
  async function assignToSpecialist(args: {
    preset: string;
    task: string;
    agentId?: string;
  }): Promise<AssignResult> {
    const state = useStore.getState();
    const cap = state.sessionBudgetUsd;
    if (cap !== null && aggregateTotals(state.stats).cost >= cap) {
      return { ok: false, error: `session budget $${cap} reached — stop and report to the user` };
    }

    let id = args.agentId;
    if (id) {
      if (!orchestrator.get(id)) return { ok: false, error: `unknown agent "${id}"` };
    } else {
      if (args.preset === LEAD_PRESET)
        return { ok: false, error: "cannot delegate to another lead" };
      const preset = getPreset(args.preset);
      if (!preset) return { ok: false, error: `unknown preset "${args.preset}"` };
      if (state.agents.length >= MAX_TEAM_AGENTS) {
        return {
          ok: false,
          error: `team is at capacity (${MAX_TEAM_AGENTS}) — reuse an existing agent via agentId`,
        };
      }
      id = createAgent(preset, { focus: false });
    }

    await sendAndSettle(id, args.task);
    const { result, errored } = captureResult(id);
    return { ok: true, agentId: id, result, errored };
  }

  /** Runs the quality gates on an agent's work and reports pass/fail to the lead. */
  async function verifyForLead(agentId: string): Promise<{ status: string; gate?: string }> {
    if (!orchestrator.get(agentId)) return { status: "unknown-agent" };
    verifier.enqueue(agentId);
    const start = Date.now();
    while (verifier.isVerifying(agentId) && Date.now() - start < 180_000) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const v = useStore.getState().verify[agentId];
    return v ? { status: v.status, ...(v.gate ? { gate: v.gate } : {}) } : { status: "no-gates" };
  }

  /** Reads an agent's latest turn output from the store (text + whether it errored). */
  function captureResult(id: string): { result: string; errored: boolean } {
    const msgs = useStore.getState().messages[id] ?? [];
    const lastUser = msgs.map((m) => m.role).lastIndexOf("user");
    const tail = msgs.slice(lastUser + 1);
    const errored = tail.some((m) => m.role === "error");
    const lastText = [...tail]
      .reverse()
      .find((m) => m.role === "assistant" && m.text.trim().length > 0);
    const result = lastText?.role === "assistant" ? lastText.text.trim() : "";
    return { result: result || (errored ? "(agent errored)" : "(no textual output)"), errored };
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
      const decision = await routePrompt(prompt, selectablePresets(), { queryFn: query });
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

  /**
   * Clones a repo as a local plugin and registers it. Progress + outcome land
   * in the router status line; the plugin is live on the next message to any
   * agent (options are rebuilt per turn).
   */
  async function installPlugin(arg: string): Promise<void> {
    const setStatus = useStore.getState().setRouterStatus;
    const parsed = parseInstallArg(arg);
    if ("error" in parsed) {
      setStatus(parsed.error);
      return;
    }
    setStatus(`Installing ${parsed.name} from ${parsed.url}…`);
    const result = await installFromGit(parsed, { cwd });
    if (!result.ok) {
      logAudit("install", undefined, `fail ${parsed.name}: ${result.error}`);
      useStore.getState().setRouterStatus(`Install failed: ${result.error}`);
      return;
    }
    useStore.getState().setInstalledPlugins(listInstalled(cwd));
    const components = result.plugin.components.join(", ");
    logAudit("install", undefined, `${parsed.name} [${parsed.scope}] ${components}`);
    useStore
      .getState()
      .setRouterStatus(`Installed ${parsed.name} (${components}) — live on the next message.`);
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
      case "mcp": {
        if (command.op?.type === "add") {
          const parsed = parseServerSpec(command.op.spec);
          if (!parsed.ok) return { notice: `Invalid server: ${parsed.error}` };
          const result = addMcpServer(cwd, command.op.name, parsed.server);
          if (!result.ok) return { notice: `Failed: ${result.error}` };
          mcpConfigRef.current = { ...mcpConfigRef.current, [command.op.name]: parsed.server };
          logAudit("mcp", undefined, `add ${command.op.name}`);
          return { notice: `Added MCP server "${command.op.name}" — live on the next turn.` };
        }
        return { notice: describeMcp(Object.keys(mcpConfigRef.current)) };
      }
      case "install": {
        if (command.op.type === "list") return { notice: describeInstalled(cwd) };
        void installPlugin(command.op.arg);
        return {};
      }
      case "uninstall": {
        const result = removeInstalled(command.name, cwd);
        if (!result.ok) return { notice: result.error };
        useStore.getState().setInstalledPlugins(listInstalled(cwd));
        logAudit("uninstall", undefined, command.name);
        return { notice: `Uninstalled ${command.name} — new agent turns won't load it.` };
      }
      case "mode": {
        const store = useStore.getState();
        if (command.mode) store.setSafetyMode(command.mode);
        else store.cycleSafetyMode();
        const mode = useStore.getState().safetyMode;
        logAudit("mode", undefined, mode);
        return { notice: `Safety mode: ${mode}` };
      }
      case "model": {
        const store = useStore.getState();
        if (!command.choice) {
          const cur = store.modelOverride;
          return {
            notice: cur ? `Model: ${cur} (all agents)` : "Model: per-preset (no override).",
          };
        }
        const next = command.choice === "default" ? null : command.choice;
        store.setModelOverride(next);
        logAudit("model", undefined, next ?? "default");
        return {
          notice: next
            ? `Model: ${next} — every agent uses it on its next turn.`
            : "Model override cleared — agents use their preset's model.",
        };
      }
      case "audit":
        return { notice: describeAudit(cwd) };
      case "ship":
        void ship();
        return { notice: "Shipping…" };
      case "worktrees": {
        const action = command.action ?? "list";
        if (action === "on") {
          useStore.getState().setWorktreesOn(true);
          logAudit("worktree", undefined, "enabled");
          return { notice: "Worktrees on — new builder agents will work in isolation." };
        }
        if (action === "off") {
          useStore.getState().setWorktreesOn(false);
          return { notice: "Worktrees off — existing ones remain (/worktrees clean to remove)." };
        }
        if (action === "clean") {
          void worktrees.releaseAll();
          return { notice: "Removing all crew worktrees…" };
        }
        return { notice: describeWorktrees(worktrees) };
      }
      case "checkpoint": {
        const label = command.label ?? "manual checkpoint";
        void checkpoints
          .checkpoint(useStore.getState().focusedAgentId ?? "crew", label)
          .then((r) => useStore.getState().setRouterStatus(r.message));
        return {};
      }
      case "undo": {
        const focused = useStore.getState().focusedAgentId;
        const undo =
          focused && worktrees.has(focused) ? worktrees.undo(focused) : checkpoints.undo();
        void undo.then((r) => useStore.getState().setRouterStatus(r.message));
        return {};
      }
      case "diff": {
        const focused = useStore.getState().focusedAgentId;
        const diff =
          focused && worktrees.has(focused) ? worktrees.diff(focused) : checkpoints.diff();
        void diff.then((text) => useStore.getState().setRouterStatus(text));
        return {};
      }
      case "plan":
        void plan(command.goal);
        return { notice: "Planning…" };
      case "lead": {
        const preset = getPreset(LEAD_PRESET);
        if (!preset) return { notice: "Lead preset unavailable." };
        const id = ensureAgent(preset);
        useStore.getState().focus(id);
        sendTo(id, command.goal);
        logAudit("lead", id, command.goal);
        return { notice: `Lead ${id} is planning & delegating (cap ${MAX_TEAM_AGENTS} agents).` };
      }
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
        const session = command.scope === "session";
        const store = useStore.getState();
        if (command.usd === undefined) {
          const cur = session ? store.sessionBudgetUsd : store.perTurnBudgetUsd;
          const label = session ? "Session budget" : "Per-turn budget";
          return {
            notice: cur ? `${label}: $${cur.toFixed(2)}` : `No ${label.toLowerCase()} set.`,
          };
        }
        if (session) store.setSessionBudget(command.usd);
        else store.setBudget(command.usd);
        logAudit("budget", undefined, `${session ? "session" : "turn"} ${command.usd ?? "off"}`);
        const word = session ? "Session budget" : "Per-turn budget";
        return { notice: command.usd ? `${word}: $${command.usd.toFixed(2)}` : `${word} cleared.` };
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
        void worktrees.release(id);
        orchestrator.remove(id);
        useStore.getState().removeAgent(id);
        autoView();
        logAudit("remove", id);
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

/** Renders `/worktrees`: active per-agent worktrees + a merge hint. */
function describeWorktrees(worktrees: WorktreeController): string {
  const on = useStore.getState().worktreesOn;
  const list = worktrees.list();
  if (list.length === 0) {
    return on ? "Worktrees on — none acquired yet." : "Worktrees off. /worktrees on to enable.";
  }
  const lines = list.map((w) => `  ${w.agentId} → ${w.branch} (${w.checkpoints} ckpt)`);
  return ["Worktrees (merge with `git merge <branch>`):", ...lines].join("\n");
}

/** Renders `/audit`: the most recent trail entries + the log path. */
function describeAudit(cwd: string): string {
  const entries = readAudit(cwd, 15);
  if (entries.length === 0) return "No audit entries yet.";
  const lines = entries.map((e) => {
    const time = e.ts.slice(11, 19); // HH:MM:SS
    const who = e.agentId ? ` ${e.agentId}` : "";
    return `  ${time} ${e.kind}${who}${e.detail ? ` · ${e.detail}` : ""}`;
  });
  return ["Audit trail (.crew/audit.jsonl):", ...lines].join("\n");
}

/** Renders `/install list`: installed plugins + their components. */
function describeInstalled(cwd: string): string {
  const list = listInstalled(cwd);
  if (list.length === 0) {
    return "No plugins installed. /install <owner/repo> [--global] to add one.";
  }
  const lines = list.map(
    (p) => `  ${p.name} [${p.scope}] — ${p.components.join(", ") || "plugin"}`,
  );
  return ["Installed plugins (loaded into every agent):", ...lines].join("\n");
}

/** Startup notice for installed plugins. */
function installedStartupNotice(installed: ReturnType<typeof listInstalled>): string | undefined {
  if (installed.length === 0) return undefined;
  return `Loaded ${installed.length} installed plugin(s): ${installed.map((p) => p.name).join(", ")}.`;
}

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
