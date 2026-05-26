import { summarizeToolResult } from "../lib/toolResult.ts";
import { TypedEmitter } from "./eventEmitter.ts";
import type {
  AccountInfo,
  AgentSessionEvents,
  AgentStatus,
  McpServerStatus,
  Options,
  QueryFn,
  SDKMessage,
  ToolBlock,
  UsageSnapshot,
} from "./types.ts";

/**
 * Wraps one SDK `query()` async generator into an event-emitting controller.
 * The UI subscribes to events and never iterates the generator itself.
 *
 * Session resume: the captured `sessionId` is passed back as `options.resume`
 * on subsequent `run()` calls, so a single AgentSession is one continuous
 * conversation.
 */
export class AgentSession extends TypedEmitter<AgentSessionEvents> {
  readonly id: string;
  sessionId?: string;
  private status: AgentStatus = "idle";
  private controller?: AbortController;
  private accountFetched = false;
  private readonly queryFn: QueryFn;

  constructor(id: string, queryFn: QueryFn) {
    super();
    this.id = id;
    this.queryFn = queryFn;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  private setStatus(status: AgentStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  /**
   * Runs one turn. Resumes the prior session when available. Resolves when the
   * turn completes; never throws — fatal errors are emitted as `error`.
   */
  async run(prompt: string, options: Options): Promise<void> {
    this.controller = new AbortController();
    const usePartials = options.includePartialMessages === true;
    this.setStatus("thinking");

    try {
      const iterator = this.queryFn({
        prompt,
        options: {
          ...options,
          abortController: this.controller,
          ...(this.sessionId ? { resume: this.sessionId } : {}),
        },
      });

      this.fetchAccountInfo(iterator);

      for await (const message of iterator) {
        this.handleMessage(message, usePartials);
      }

      // Generator completed without an explicit result message.
      if (this.status !== "done" && this.status !== "error") {
        this.setStatus("done");
      }
    } catch (error) {
      if (this.controller.signal.aborted) {
        this.setStatus("stopped");
        return;
      }
      this.setStatus("error");
      this.emit("error", asError(error));
    } finally {
      this.controller = undefined;
    }
  }

  private handleMessage(message: SDKMessage, usePartials: boolean): void {
    this.captureSession(message);

    switch (message.type) {
      case "stream_event":
        if (usePartials) this.handleStreamEvent(message);
        return;
      case "assistant":
        this.handleAssistant(message, usePartials);
        return;
      case "user":
        this.handleUser(message);
        return;
      case "system":
        this.handleSystem(message);
        return;
      case "result":
        this.handleResult(message);
        return;
      default:
        return;
    }
  }

  /** Surfaces MCP server statuses from the session init message. */
  private handleSystem(message: Extract<SDKMessage, { type: "system" }>): void {
    if (message.subtype !== "init") return;
    const servers = (message as { mcp_servers?: { name: string; status: string }[] }).mcp_servers;
    if (servers && servers.length > 0) {
      this.emit("mcp", servers as unknown as McpServerStatus[]);
    }
  }

  /** Emits a tool result when a user message carries one. */
  private handleUser(message: Extract<SDKMessage, { type: "user" }>): void {
    const payload = (message as { tool_use_result?: unknown }).tool_use_result;
    const toolUseId = message.parent_tool_use_id;
    if (payload == null || !toolUseId) return;
    this.emit("toolResult", { toolUseId, summary: summarizeToolResult(payload) });
  }

  /** Fetches subscription/account info once, when the transport supports it. */
  private fetchAccountInfo(iterator: unknown): void {
    if (this.accountFetched) return;
    const fn = (iterator as { accountInfo?: () => Promise<AccountInfo> }).accountInfo;
    if (typeof fn !== "function") return;
    this.accountFetched = true;
    void fn
      .call(iterator)
      .then((info: AccountInfo) => this.emit("account", info))
      .catch(() => {
        /* account info is best-effort */
      });
  }

  private captureSession(message: SDKMessage): void {
    const sessionId = (message as { session_id?: string }).session_id;
    if (sessionId && sessionId !== this.sessionId) {
      this.sessionId = sessionId;
      this.emit("session", sessionId);
    }
  }

  private handleStreamEvent(message: Extract<SDKMessage, { type: "stream_event" }>): void {
    const event = message.event;
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta" &&
      event.delta.text
    ) {
      this.setStatus("thinking");
      this.emit("delta", event.delta.text);
    }
  }

  private handleAssistant(
    message: Extract<SDKMessage, { type: "assistant" }>,
    usePartials: boolean,
  ): void {
    const blocks = message.message.content;
    if (!Array.isArray(blocks)) return;

    for (const block of blocks) {
      if (block.type === "tool_use") {
        const tool: ToolBlock = {
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        };
        this.setStatus("running-tool");
        this.emit("tool", tool);
      } else if (block.type === "text" && !usePartials && block.text) {
        // With partials enabled, text already streamed via `delta`.
        this.emit("text", block.text);
      }
    }
  }

  private handleResult(message: Extract<SDKMessage, { type: "result" }>): void {
    this.emit("usage", toUsageSnapshot(message)); // failed turns still cost tokens
    if (message.subtype === "success") {
      this.emit("result", message.result);
      this.setStatus("done");
    } else {
      this.setStatus("error");
      this.emit("error", new Error(resultErrorMessage(message)));
    }
  }

  /** Aborts the in-flight turn, if any. Idempotent. */
  stop(): void {
    this.controller?.abort();
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

type ErrorResult = Exclude<Extract<SDKMessage, { type: "result" }>, { subtype: "success" }>;

/** Friendly message for an error result, naming budget/turn caps explicitly. */
function resultErrorMessage(message: ErrorResult): string {
  switch (message.subtype) {
    case "error_max_budget_usd":
      return "budget cap reached — raise it with /budget";
    case "error_max_turns":
      return "turn cap reached";
    default:
      return message.errors?.join("; ") || message.subtype;
  }
}

/** Maps a result message (success or error — both carry usage) into a {@link UsageSnapshot}. */
function toUsageSnapshot(message: Extract<SDKMessage, { type: "result" }>): UsageSnapshot {
  const usage = message.usage;
  const [model, modelUsage] = dominantModel(message.modelUsage);
  return {
    costUsd: message.total_cost_usd ?? 0,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    contextWindow: modelUsage?.contextWindow ?? 0,
    model,
  };
}

type ModelUsageEntry = { costUSD?: number; contextWindow?: number };

/** Picks the model with the highest cost from a per-model usage map. */
function dominantModel(
  modelUsage: Record<string, ModelUsageEntry> | undefined,
): [string, ModelUsageEntry | undefined] {
  const entries = Object.entries(modelUsage ?? {});
  if (entries.length === 0) return ["", undefined];
  return entries.reduce((best, entry) =>
    (entry[1].costUSD ?? 0) > (best[1].costUSD ?? 0) ? entry : best,
  );
}
