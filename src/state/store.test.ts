import { beforeEach, describe, expect, test } from "bun:test";
import { useStore } from "./store.ts";

const reset = () =>
  useStore.setState({
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
  });

const s = () => useStore.getState();

describe("store", () => {
  beforeEach(reset);

  test("addAgent registers the agent and auto-focuses the first one", () => {
    s().addAgent("coder-1", "coder");
    s().addAgent("reviewer-1", "reviewer");

    expect(s().agents).toHaveLength(2);
    expect(s().focusedAgentId).toBe("coder-1");
  });

  test("setStatus updates only the targeted agent immutably", () => {
    s().addAgent("coder-1", "coder");
    const before = s().agents;

    s().setStatus("coder-1", "thinking");

    expect(s().agents[0]?.status).toBe("thinking");
    expect(s().agents).not.toBe(before);
  });

  test("appendDelta builds one open assistant message", () => {
    s().addAgent("a", "coder");
    s().appendDelta("a", "Hel");
    s().appendDelta("a", "lo");

    const messages = s().messages.a ?? [];
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m?.role).toBe("assistant");
    if (m?.role === "assistant") expect(m.text).toBe("Hello");
  });

  test("addToolBlock attaches tools to the open assistant message", () => {
    s().addAgent("a", "coder");
    s().appendDelta("a", "working");
    s().addToolBlock("a", { id: "t1", name: "Read", input: {} });

    const m = s().messages.a?.[0];
    if (m?.role === "assistant") {
      expect(m.tools).toHaveLength(1);
      expect(m.tools[0]?.name).toBe("Read");
    }
  });

  test("finalizeTurn closes the open message; next delta starts a new one", () => {
    s().addAgent("a", "coder");
    s().appendDelta("a", "first");
    s().finalizeTurn("a", "first");
    s().appendDelta("a", "second");

    const messages = s().messages.a ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ done: true, text: "first" });
    expect(messages[1]).toMatchObject({ done: false, text: "second" });
  });

  test("finalizeTurn falls back to result text when no deltas streamed", () => {
    s().addAgent("a", "coder");
    s().finalizeTurn("a", "the result");

    const m = s().messages.a?.[0];
    if (m?.role === "assistant") expect(m.text).toBe("the result");
  });

  test("addUserMessage and addError append correctly", () => {
    s().addAgent("a", "coder");
    s().addUserMessage("a", "do it");
    s().addError("a", "boom");

    const messages = s().messages.a ?? [];
    expect(messages[0]).toEqual({ role: "user", text: "do it" });
    expect(messages[1]).toEqual({ role: "error", text: "boom" });
  });

  test("removeAgent drops messages and re-focuses", () => {
    s().addAgent("a", "coder");
    s().addAgent("b", "reviewer");
    s().removeAgent("a");

    expect(s().agents).toHaveLength(1);
    expect(s().messages.a).toBeUndefined();
    expect(s().focusedAgentId).toBe("b");
  });

  test("resolvePermission resolves the resolver and removes the request", () => {
    let resolved: boolean | undefined;
    s().addPermissionRequest({
      id: "p1",
      agentId: "a",
      toolName: "Bash",
      input: {},
      resolve: (allow) => {
        resolved = allow;
      },
    });

    s().resolvePermission("p1", true);

    expect(resolved).toBe(true);
    expect(s().permissionRequests).toHaveLength(0);
  });

  test("toggleViewMode flips between grid and focus and locks", () => {
    expect(s().viewMode).toBe("focus");
    s().toggleViewMode();
    expect(s().viewMode).toBe("grid");
    expect(s().viewModeLocked).toBe(true);
    s().toggleViewMode();
    expect(s().viewMode).toBe("focus");
  });

  test("autoViewMode respects the lock set by a manual choice", () => {
    s().autoViewMode("grid");
    expect(s().viewMode).toBe("grid"); // not locked yet → applied
    s().setViewMode("focus"); // explicit → locks
    s().autoViewMode("grid"); // ignored because locked
    expect(s().viewMode).toBe("focus");
  });

  test("addAgent seeds a zero scroll offset", () => {
    s().addAgent("a", "coder");
    expect(s().scrollOffsets.a).toBe(0);
  });

  test("scrollPane clamps at zero and accumulates; resetScroll returns to tail", () => {
    s().addAgent("a", "coder");
    s().scrollPane("a", 5);
    s().scrollPane("a", 3);
    expect(s().scrollOffsets.a).toBe(8);
    s().scrollPane("a", -100);
    expect(s().scrollOffsets.a).toBe(0);
    s().scrollPane("a", 4);
    s().resetScroll("a");
    expect(s().scrollOffsets.a).toBe(0);
  });

  test("addUsage accumulates cost/tokens and replaces contextWindow/model", () => {
    s().addAgent("a", "coder");
    s().addUsage("a", {
      costUsd: 0.01,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      contextWindow: 200000,
      model: "sonnet",
    });
    s().addUsage("a", {
      costUsd: 0.02,
      inputTokens: 50,
      outputTokens: 10,
      cacheReadTokens: 1,
      contextWindow: 180000,
      model: "sonnet",
    });
    const stats = s().stats.a;
    expect(stats?.costUsd).toBeCloseTo(0.03);
    expect(stats?.inputTokens).toBe(150);
    expect(stats?.outputTokens).toBe(30);
    expect(stats?.cacheReadTokens).toBe(6);
    expect(stats?.contextWindow).toBe(180000);
  });

  test("setToolResult upserts by tool-use id", () => {
    s().setToolResult("t1", "first");
    s().setToolResult("t1", "second");
    expect(s().toolResults.t1).toBe("second");
  });

  test("removeAgent clears routerStatus that references the removed agent", () => {
    s().addAgent("coder-1", "coder");
    s().setRouterStatus("↳ coder-1 · matched");
    s().removeAgent("coder-1");
    expect(s().routerStatus).toBeNull();
  });

  test("setAccount stores subscription info", () => {
    s().setAccount({ subscriptionType: "Max", email: "x@y.z" });
    expect(s().account?.subscriptionType).toBe("Max");
  });

  test("cycleSafetyMode walks normal→plan→acceptEdits→bypass→normal", () => {
    expect(s().safetyMode).toBe("normal");
    s().cycleSafetyMode();
    expect(s().safetyMode).toBe("plan");
    s().cycleSafetyMode();
    expect(s().safetyMode).toBe("acceptEdits");
    s().cycleSafetyMode();
    expect(s().safetyMode).toBe("bypassPermissions");
    s().cycleSafetyMode();
    expect(s().safetyMode).toBe("normal");
  });

  test("setSafetyMode sets directly", () => {
    s().setSafetyMode("bypassPermissions");
    expect(s().safetyMode).toBe("bypassPermissions");
  });

  test("removeAgent clears scroll and stats too", () => {
    s().addAgent("a", "coder");
    s().addUsage("a", {
      costUsd: 0.01,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      contextWindow: 1,
      model: "sonnet",
    });
    s().removeAgent("a");
    expect(s().scrollOffsets.a).toBeUndefined();
    expect(s().stats.a).toBeUndefined();
  });
});
