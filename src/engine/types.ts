import type {
  McpServerConfig,
  McpServerStatus,
  Options,
  PermissionMode,
  Query,
  SdkPluginConfig,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Lifecycle status of a single agent session. Drives sidebar status dots.
 */
export type AgentStatus = "idle" | "thinking" | "running-tool" | "done" | "error" | "stopped";

/**
 * A streamed tool-use block surfaced from the SDK.
 */
export type ToolBlock = {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
};

/**
 * Cost and token usage for a completed turn, derived from the SDK result.
 */
export type UsageSnapshot = {
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly contextWindow: number;
  readonly model: string;
};

/** The output of a tool call, keyed by the originating tool-use id. */
export type ToolResult = {
  readonly toolUseId: string;
  readonly summary: string;
};

/** Subscription/account info surfaced once per session for the header badge. */
export type AccountInfo = {
  readonly email?: string;
  readonly organization?: string;
  readonly subscriptionType?: string;
};

/**
 * Events emitted by an {@link AgentSession}. The UI subscribes to these and
 * never touches the SDK async generator directly.
 */
export type AgentSessionEvents = {
  /** Incremental text delta (token-level when partial messages are enabled). */
  delta: [text: string];
  /** A complete assistant text block (fallback when partials are off). */
  text: [text: string];
  /** A tool-use block requested by the agent. */
  tool: [block: ToolBlock];
  /** Final result text for a turn. */
  result: [text: string];
  /** Cost/token usage for a completed turn. */
  usage: [snapshot: UsageSnapshot];
  /** The output of a completed tool call. */
  toolResult: [result: ToolResult];
  /** Subscription/account info (emitted at most once per session). */
  account: [info: AccountInfo];
  /** MCP server connection statuses from the session init message. */
  mcp: [servers: readonly McpServerStatus[]];
  /** Lifecycle status transition. */
  status: [status: AgentStatus];
  /** Captured session id (used for resume). */
  session: [sessionId: string];
  /** A fatal error during the turn. */
  error: [error: Error];
};

/**
 * Signature of the SDK `query` function. Injected into {@link AgentSession} so
 * tests can supply a mock async generator without spawning the real binary.
 */
export type QueryFn = (params: { prompt: string; options?: Options }) => Query;

export type {
  McpServerConfig,
  McpServerStatus,
  Options,
  PermissionMode,
  SdkPluginConfig,
  SDKMessage,
};
