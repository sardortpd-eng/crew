import { create } from "zustand";
import type {
  AccountInfo,
  AgentStatus,
  McpServerStatus,
  ToolBlock,
  UsageSnapshot,
} from "../engine/types.ts";

/** Which layout the viewer is showing. */
export type ViewMode = "grid" | "focus";

/**
 * Session-wide safety level (cycled with Shift+Tab), overriding each agent's
 * preset permission mode:
 * - `normal` — agents use their preset's own mode (crew's default)
 * - `plan` — read-only everywhere; no edits or shell
 * - `acceptEdits` — every agent auto-accepts edits
 * - `bypassPermissions` — skip all approval prompts (dangerous)
 */
export type SafetyMode = "normal" | "plan" | "acceptEdits" | "bypassPermissions";

/** Cycle order for Shift+Tab. */
export const SAFETY_MODES: readonly SafetyMode[] = [
  "normal",
  "plan",
  "acceptEdits",
  "bypassPermissions",
];

/** Accumulated cost/token usage for one agent. */
export type AgentStats = {
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly contextWindow: number;
  readonly model: string;
};

/** One item on the task board (from `/plan`). */
export type Task = {
  readonly id: string;
  readonly title: string;
  readonly preset: string;
  readonly status: "todo" | "active" | "done" | "failed";
};

/** One git checkpoint commit made by crew. */
export type CheckpointInfo = {
  readonly sha: string;
  readonly agentId: string;
  readonly label: string;
};

/** Verify + auto-fix loop state for one agent. */
export type VerifyState = {
  readonly status: "idle" | "running" | "passed" | "failed";
  readonly gate?: string;
  readonly attempt: number;
  readonly maxAttempts: number;
};

/** A single transcript entry for an agent. */
export type Message =
  | { readonly role: "user"; readonly text: string }
  | {
      readonly role: "assistant";
      readonly text: string;
      readonly tools: readonly ToolBlock[];
      readonly done: boolean;
    }
  | { readonly role: "error"; readonly text: string };

/** Sidebar view of a spawned agent. */
export type AgentView = {
  readonly id: string;
  readonly presetName: string;
  readonly status: AgentStatus;
  /** SDK session id, captured for resume + persistence. */
  readonly sessionId?: string;
};

/** A tool-use approval awaiting the user's allow/deny decision. */
export type PermissionRequest = {
  readonly id: string;
  readonly agentId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly resolve: (allow: boolean) => void;
};

type StoreState = {
  readonly agents: readonly AgentView[];
  readonly messages: Readonly<Record<string, readonly Message[]>>;
  readonly focusedAgentId: string | null;
  readonly permissionRequests: readonly PermissionRequest[];
  readonly viewMode: ViewMode;
  readonly viewModeLocked: boolean;
  readonly scrollOffsets: Readonly<Record<string, number>>;
  readonly stats: Readonly<Record<string, AgentStats>>;
  readonly toolResults: Readonly<Record<string, string>>;
  readonly account: AccountInfo | null;
  readonly verify: Readonly<Record<string, VerifyState>>;
  readonly routerStatus: string | null;
  readonly mcpStatus: readonly McpServerStatus[];
  readonly safetyMode: SafetyMode;
  readonly checkpointBranch: string | null;
  readonly checkpoints: readonly CheckpointInfo[];
  /** Per-turn spend cap in USD (null = no cap). */
  readonly perTurnBudgetUsd: number | null;
  readonly tasks: readonly Task[];
  /** Whether builder agents are isolated into their own git worktrees. */
  readonly worktreesOn: boolean;

  addAgent: (id: string, presetName: string) => void;
  removeAgent: (id: string) => void;
  setStatus: (id: string, status: AgentStatus) => void;
  setSessionId: (id: string, sessionId: string) => void;
  focus: (id: string | null) => void;

  addUserMessage: (id: string, text: string) => void;
  appendDelta: (id: string, text: string) => void;
  addToolBlock: (id: string, tool: ToolBlock) => void;
  finalizeTurn: (id: string, resultText: string) => void;
  addError: (id: string, text: string) => void;

  addPermissionRequest: (request: PermissionRequest) => void;
  resolvePermission: (requestId: string, allow: boolean) => void;

  setViewMode: (mode: ViewMode) => void;
  autoViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  lockView: () => void;
  scrollPane: (id: string, deltaLines: number) => void;
  resetScroll: (id: string) => void;
  addUsage: (id: string, snapshot: UsageSnapshot) => void;
  setToolResult: (toolUseId: string, summary: string) => void;
  setAccount: (info: AccountInfo) => void;
  setVerify: (id: string, state: VerifyState) => void;
  clearVerify: (id: string) => void;
  setRouterStatus: (status: string | null) => void;
  setMcpStatus: (servers: readonly McpServerStatus[]) => void;
  setSafetyMode: (mode: SafetyMode) => void;
  cycleSafetyMode: () => void;
  setCheckpoints: (branch: string | null, checkpoints: readonly CheckpointInfo[]) => void;
  setBudget: (usd: number | null) => void;
  addTasks: (tasks: ReadonlyArray<{ title: string; preset: string }>) => void;
  setTaskStatus: (id: string, status: Task["status"]) => void;
  setTasks: (tasks: readonly Task[]) => void;
  clearTasks: () => void;
  setWorktreesOn: (on: boolean) => void;
};

export const useStore = create<StoreState>((set, get) => ({
  agents: [],
  messages: {},
  focusedAgentId: null,
  permissionRequests: [],
  viewMode: "focus",
  viewModeLocked: false,
  scrollOffsets: {},
  stats: {},
  toolResults: {},
  account: null,
  verify: {},
  routerStatus: null,
  mcpStatus: [],
  safetyMode: "normal",
  checkpointBranch: null,
  checkpoints: [],
  perTurnBudgetUsd: null,
  tasks: [],
  worktreesOn: false,

  addAgent: (id, presetName) =>
    set((s) => ({
      agents: [...s.agents, { id, presetName, status: "idle" }],
      messages: { ...s.messages, [id]: s.messages[id] ?? [] },
      scrollOffsets: { ...s.scrollOffsets, [id]: 0 },
      focusedAgentId: s.focusedAgentId ?? id,
    })),

  removeAgent: (id) =>
    set((s) => {
      const { [id]: _msgs, ...messages } = s.messages;
      const { [id]: _scroll, ...scrollOffsets } = s.scrollOffsets;
      const { [id]: _stat, ...stats } = s.stats;
      const { [id]: _v, ...verify } = s.verify;
      const agents = s.agents.filter((a) => a.id !== id);
      const focusedAgentId = s.focusedAgentId === id ? (agents[0]?.id ?? null) : s.focusedAgentId;
      // Drop the router breadcrumb if it referenced the removed agent.
      const routerStatus = s.routerStatus?.includes(id) ? null : s.routerStatus;
      return { agents, messages, scrollOffsets, stats, verify, focusedAgentId, routerStatus };
    }),

  setStatus: (id, status) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    })),

  setSessionId: (id, sessionId) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, sessionId } : a)),
    })),

  focus: (id) => set({ focusedAgentId: id }),

  addUserMessage: (id, text) =>
    set((s) => ({
      messages: appendMessage(s.messages, id, { role: "user", text }),
    })),

  appendDelta: (id, text) =>
    set((s) => ({
      messages: updateOpenAssistant(s.messages, id, (m) => ({
        ...m,
        text: m.text + text,
      })),
    })),

  addToolBlock: (id, tool) =>
    set((s) => ({
      messages: updateOpenAssistant(s.messages, id, (m) => ({
        ...m,
        tools: [...m.tools, tool],
      })),
    })),

  finalizeTurn: (id, resultText) =>
    set((s) => ({
      messages: updateOpenAssistant(s.messages, id, (m) => ({
        ...m,
        text: m.text.length > 0 ? m.text : resultText,
        done: true,
      })),
    })),

  addError: (id, text) =>
    set((s) => ({
      messages: appendMessage(s.messages, id, { role: "error", text }),
    })),

  addPermissionRequest: (request) =>
    set((s) => ({ permissionRequests: [...s.permissionRequests, request] })),

  resolvePermission: (requestId, allow) => {
    const request = get().permissionRequests.find((r) => r.id === requestId);
    if (!request) return;
    request.resolve(allow);
    set((s) => ({
      permissionRequests: s.permissionRequests.filter((r) => r.id !== requestId),
    }));
  },

  setViewMode: (mode) => set({ viewMode: mode, viewModeLocked: true }),

  autoViewMode: (mode) => set((s) => (s.viewModeLocked ? {} : { viewMode: mode })),

  toggleViewMode: () =>
    set((s) => ({
      viewMode: s.viewMode === "grid" ? "focus" : "grid",
      viewModeLocked: true,
    })),

  lockView: () => set({ viewModeLocked: true }),

  scrollPane: (id, deltaLines) =>
    set((s) => ({
      scrollOffsets: {
        ...s.scrollOffsets,
        [id]: Math.max(0, (s.scrollOffsets[id] ?? 0) + deltaLines),
      },
    })),

  resetScroll: (id) => set((s) => ({ scrollOffsets: { ...s.scrollOffsets, [id]: 0 } })),

  addUsage: (id, snapshot) =>
    set((s) => {
      const prev = s.stats[id];
      const next: AgentStats = {
        costUsd: (prev?.costUsd ?? 0) + snapshot.costUsd,
        inputTokens: (prev?.inputTokens ?? 0) + snapshot.inputTokens,
        outputTokens: (prev?.outputTokens ?? 0) + snapshot.outputTokens,
        cacheReadTokens: (prev?.cacheReadTokens ?? 0) + snapshot.cacheReadTokens,
        contextWindow: snapshot.contextWindow, // latest wins
        model: snapshot.model || prev?.model || "",
      };
      return { stats: { ...s.stats, [id]: next } };
    }),

  setToolResult: (toolUseId, summary) =>
    set((s) => ({ toolResults: { ...s.toolResults, [toolUseId]: summary } })),

  setAccount: (info) => set({ account: info }),

  setVerify: (id, state) => set((s) => ({ verify: { ...s.verify, [id]: state } })),

  clearVerify: (id) =>
    set((s) => {
      const { [id]: _v, ...verify } = s.verify;
      return { verify };
    }),

  setRouterStatus: (status) => set({ routerStatus: status }),

  setMcpStatus: (servers) => set({ mcpStatus: servers }),

  setSafetyMode: (mode) => set({ safetyMode: mode }),

  cycleSafetyMode: () =>
    set((s) => {
      const i = SAFETY_MODES.indexOf(s.safetyMode);
      return { safetyMode: SAFETY_MODES[(i + 1) % SAFETY_MODES.length] ?? "normal" };
    }),

  setCheckpoints: (branch, checkpoints) => set({ checkpointBranch: branch, checkpoints }),

  setBudget: (usd) => set({ perTurnBudgetUsd: usd }),

  addTasks: (tasks) =>
    set((s) => {
      const base = s.tasks.length;
      const next = tasks.map((t, i) => ({
        id: `task-${base + i + 1}`,
        title: t.title,
        preset: t.preset,
        status: "todo" as const,
      }));
      return { tasks: [...s.tasks, ...next] };
    }),

  setTaskStatus: (id, status) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)) })),

  setTasks: (tasks) => set({ tasks: [...tasks] }),

  clearTasks: () => set({ tasks: [] }),

  setWorktreesOn: (on) => set({ worktreesOn: on }),
}));

type Messages = Readonly<Record<string, readonly Message[]>>;
type OpenAssistant = Extract<Message, { role: "assistant" }>;

function appendMessage(messages: Messages, id: string, message: Message): Messages {
  const list = messages[id] ?? [];
  return { ...messages, [id]: [...list, message] };
}

/**
 * Applies `update` to the agent's open (not-done) assistant message, creating a
 * fresh one if none is open. Always returns new arrays — never mutates.
 */
function updateOpenAssistant(
  messages: Messages,
  id: string,
  update: (m: OpenAssistant) => OpenAssistant,
): Messages {
  const list = messages[id] ?? [];
  const last = list[list.length - 1];

  if (last && last.role === "assistant" && !last.done) {
    const next = [...list.slice(0, -1), update(last)];
    return { ...messages, [id]: next };
  }

  const fresh: OpenAssistant = { role: "assistant", text: "", tools: [], done: false };
  return { ...messages, [id]: [...list, update(fresh)] };
}
