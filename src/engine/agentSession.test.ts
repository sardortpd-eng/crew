import { describe, expect, test } from "bun:test";
import { AgentSession } from "./agentSession.ts";
import {
  assistantText,
  assistantTool,
  makeMockQuery,
  resultError,
  resultSuccess,
  resultWithUsage,
  systemInit,
  textDelta,
  toolResultMessage,
} from "./mockQuery.ts";
import type { AgentStatus, Options, ToolBlock, ToolResult, UsageSnapshot } from "./types.ts";

const PARTIALS: Options = { includePartialMessages: true };

describe("AgentSession", () => {
  test("emits text deltas from stream events when partials enabled", async () => {
    const query = makeMockQuery([textDelta("Hel"), textDelta("lo"), resultSuccess("Hello")]);
    const session = new AgentSession("a-1", query);
    const deltas: string[] = [];
    session.on("delta", (t) => deltas.push(t));

    await session.run("hi", PARTIALS);

    expect(deltas).toEqual(["Hel", "lo"]);
  });

  test("emits tool block from assistant tool_use", async () => {
    const query = makeMockQuery([
      assistantTool("t1", "Read", { file_path: "/x" }),
      resultSuccess("done"),
    ]);
    const session = new AgentSession("a-2", query);
    const tools: ToolBlock[] = [];
    session.on("tool", (b) => tools.push(b));

    await session.run("read x", PARTIALS);

    expect(tools).toEqual([{ id: "t1", name: "Read", input: { file_path: "/x" } }]);
  });

  test("emits result and transitions to done on success", async () => {
    const query = makeMockQuery([resultSuccess("the answer")]);
    const session = new AgentSession("a-3", query);
    const results: string[] = [];
    const statuses: AgentStatus[] = [];
    session.on("result", (t) => results.push(t));
    session.on("status", (s) => statuses.push(s));

    await session.run("q", PARTIALS);

    expect(results).toEqual(["the answer"]);
    expect(session.getStatus()).toBe("done");
    expect(statuses).toContain("thinking");
    expect(statuses).toContain("done");
  });

  test("captures session id and emits session event once", async () => {
    const query = makeMockQuery([textDelta("x", "sess-42"), resultSuccess("x", "sess-42")]);
    const session = new AgentSession("a-4", query);
    const sessions: string[] = [];
    session.on("session", (id) => sessions.push(id));

    await session.run("q", PARTIALS);

    expect(sessions).toEqual(["sess-42"]);
    expect(session.sessionId).toBe("sess-42");
  });

  test("passes resume with captured session id on the second run", async () => {
    const query = makeMockQuery([resultSuccess("ok", "sess-99")]);
    const session = new AgentSession("a-5", query);

    await session.run("first", PARTIALS);
    await session.run("second", PARTIALS);

    expect(query.calls[0]?.options?.resume).toBeUndefined();
    expect(query.calls[1]?.options?.resume).toBe("sess-99");
  });

  test("emits error and transitions to error on result error", async () => {
    const query = makeMockQuery([resultError(["boom"])]);
    const session = new AgentSession("a-6", query);
    const errors: Error[] = [];
    session.on("error", (e) => errors.push(e));

    await session.run("q", PARTIALS);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("boom");
    expect(session.getStatus()).toBe("error");
  });

  test("stop() aborts the turn and transitions to stopped without error", async () => {
    const query = makeMockQuery([textDelta("partial")], { hang: true });
    const session = new AgentSession("a-7", query);
    const errors: Error[] = [];
    session.on("error", (e) => errors.push(e));

    const run = session.run("long task", PARTIALS);
    await Promise.resolve();
    session.stop();
    await run;

    expect(errors).toHaveLength(0);
    expect(session.getStatus()).toBe("stopped");
  });

  test("emits text blocks (not deltas) when partials disabled", async () => {
    const query = makeMockQuery([assistantText("complete text"), resultSuccess("complete text")]);
    const session = new AgentSession("a-8", query);
    const texts: string[] = [];
    const deltas: string[] = [];
    session.on("text", (t) => texts.push(t));
    session.on("delta", (t) => deltas.push(t));

    await session.run("q", {});

    expect(texts).toEqual(["complete text"]);
    expect(deltas).toEqual([]);
  });

  test("emits a usage snapshot from a result with usage", async () => {
    const query = makeMockQuery([
      resultWithUsage("ok", {
        costUsd: 0.012,
        inputTokens: 1500,
        outputTokens: 300,
        cacheReadTokens: 100,
        model: "claude-sonnet-4-5",
        contextWindow: 200_000,
      }),
    ]);
    const session = new AgentSession("a-9", query);
    const usages: UsageSnapshot[] = [];
    session.on("usage", (u) => usages.push(u));

    await session.run("q", PARTIALS);

    expect(usages).toHaveLength(1);
    expect(usages[0]).toEqual({
      costUsd: 0.012,
      inputTokens: 1500,
      outputTokens: 300,
      cacheReadTokens: 100,
      contextWindow: 200_000,
      model: "claude-sonnet-4-5",
    });
  });

  test("emits a toolResult from a user message carrying tool_use_result", async () => {
    const query = makeMockQuery([
      assistantTool("t1", "Bash", { command: "ls" }),
      toolResultMessage("t1", { stdout: "file-a\nfile-b" }),
      resultSuccess("done"),
    ]);
    const session = new AgentSession("a-10", query);
    const results: ToolResult[] = [];
    session.on("toolResult", (r) => results.push(r));

    await session.run("list files", PARTIALS);

    expect(results).toEqual([{ toolUseId: "t1", summary: "file-a file-b" }]);
  });

  test("emits usage even when the turn ends in an error result", async () => {
    const query = makeMockQuery([resultError(["boom"])]);
    const session = new AgentSession("a-12", query);
    const usages: UsageSnapshot[] = [];
    const errors: Error[] = [];
    session.on("usage", (u) => usages.push(u));
    session.on("error", (e) => errors.push(e));

    await session.run("q", PARTIALS);

    expect(usages).toHaveLength(1); // failed turns still cost tokens
    expect(errors).toHaveLength(1);
  });

  test("reports a budget cap with a friendly message", async () => {
    const query = makeMockQuery([resultError([], "sess-default", "error_max_budget_usd")]);
    const session = new AgentSession("a-13", query);
    const errors: Error[] = [];
    session.on("error", (e) => errors.push(e));

    await session.run("q", PARTIALS);

    expect(errors[0]?.message).toContain("budget cap");
  });

  test("emits mcp server statuses from the init message", async () => {
    const query = makeMockQuery([
      systemInit([{ name: "playwright", status: "connected" }]),
      resultSuccess("ok"),
    ]);
    const session = new AgentSession("a-11", query);
    const seen: Array<{ name: string; status: string }> = [];
    session.on("mcp", (servers) => seen.push(...servers));

    await session.run("q", PARTIALS);

    expect(seen).toEqual([{ name: "playwright", status: "connected" }]);
  });
});
