import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, QueryFn, SDKMessage } from "./types.ts";

const SID = "sess-default";

/** Builds a `stream_event` carrying an incremental text delta. */
export function textDelta(text: string, sessionId = SID): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    parent_tool_use_id: null,
    uuid: "u-delta",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

/** Builds an `assistant` message containing a single tool_use block. */
export function assistantTool(
  id: string,
  name: string,
  input: Record<string, unknown>,
  sessionId = SID,
): SDKMessage {
  return {
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name, input }] },
    parent_tool_use_id: null,
    uuid: "u-tool",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

/** Builds an `assistant` message containing a single text block. */
export function assistantText(text: string, sessionId = SID): SDKMessage {
  return {
    type: "assistant",
    message: { content: [{ type: "text", text }] },
    parent_tool_use_id: null,
    uuid: "u-text",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

/** Builds a successful `result` message. */
export function resultSuccess(text: string, sessionId = SID): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    result: text,
    is_error: false,
    session_id: sessionId,
    uuid: "u-result",
  } as unknown as SDKMessage;
}

/** Builds a successful `result` message carrying cost/token usage. */
export function resultWithUsage(
  text: string,
  usage: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    model?: string;
    contextWindow?: number;
  },
  sessionId = SID,
): SDKMessage {
  const model = usage.model ?? "claude-sonnet";
  return {
    type: "result",
    subtype: "success",
    result: text,
    is_error: false,
    total_cost_usd: usage.costUsd,
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_input_tokens: usage.cacheReadTokens ?? 0,
      cache_creation_input_tokens: 0,
    },
    modelUsage: {
      [model]: {
        costUSD: usage.costUsd,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        contextWindow: usage.contextWindow ?? 200_000,
      },
    },
    session_id: sessionId,
    uuid: "u-result-usage",
  } as unknown as SDKMessage;
}

/** Builds a `user` message carrying a tool result for a prior tool_use. */
export function toolResultMessage(
  parentToolUseId: string,
  payload: unknown,
  sessionId = SID,
): SDKMessage {
  return {
    type: "user",
    message: { role: "user", content: [] },
    parent_tool_use_id: parentToolUseId,
    tool_use_result: payload,
    session_id: sessionId,
    uuid: "u-toolresult",
  } as unknown as SDKMessage;
}

/** Builds a `system`/`init` message carrying MCP server statuses. */
export function systemInit(
  mcpServers: Array<{ name: string; status: string }>,
  sessionId = SID,
): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    mcp_servers: mcpServers,
    session_id: sessionId,
    uuid: "u-init",
  } as unknown as SDKMessage;
}

/** Builds an error `result` message. */
export function resultError(errors: string[], sessionId = SID): SDKMessage {
  return {
    type: "result",
    subtype: "error_during_execution",
    errors,
    is_error: true,
    session_id: sessionId,
    uuid: "u-error",
  } as unknown as SDKMessage;
}

export type MockQuery = QueryFn & {
  /** Captured params of every query() call, in order. */
  readonly calls: Array<{ prompt: string; options?: Options }>;
};

/**
 * Builds an injectable mock `query`. Yields the given messages, then optionally
 * hangs until the abort signal fires (to exercise `stop()`).
 */
export function makeMockQuery(messages: SDKMessage[], opts: { hang?: boolean } = {}): MockQuery {
  const calls: Array<{ prompt: string; options?: Options }> = [];

  const fn = ((params: { prompt: string; options?: Options }) => {
    calls.push({ prompt: params.prompt, options: params.options });
    const signal = params.options?.abortController?.signal;

    async function* generate(): AsyncGenerator<SDKMessage, void> {
      for (const message of messages) {
        if (signal?.aborted) throw new Error("aborted");
        yield message;
      }
      if (opts.hang) {
        await new Promise<void>((_resolve, reject) => {
          if (signal?.aborted) return reject(new Error("aborted"));
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }
    }

    return generate() as unknown as Query;
  }) as MockQuery;

  Object.defineProperty(fn, "calls", { value: calls });
  return fn;
}
