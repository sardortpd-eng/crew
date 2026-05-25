import { describe, expect, test } from "bun:test";
import { makeMockQuery, resultError, resultSuccess } from "./mockQuery.ts";
import { Orchestrator } from "./orchestrator.ts";
import { getPreset } from "./presets.ts";

function coder() {
  const preset = getPreset("coder");
  if (!preset) throw new Error("coder preset missing");
  return preset;
}

describe("Orchestrator", () => {
  test("spawn creates an agent with a preset-derived id", () => {
    const query = makeMockQuery([resultSuccess("ok")]);
    const orch = new Orchestrator({ queryFn: query });

    const a = orch.spawn(coder());
    const b = orch.spawn(coder());

    expect(a.id).toBe("coder-1");
    expect(b.id).toBe("coder-2");
    expect(orch.list()).toHaveLength(2);
  });

  test("send routes the prompt to the named agent", async () => {
    const query = makeMockQuery([resultSuccess("ok")]);
    const orch = new Orchestrator({ queryFn: query });
    const agent = orch.spawn(coder());

    await orch.send(agent.id, "do the thing");

    expect(query.calls).toHaveLength(1);
    expect(query.calls[0]?.prompt).toBe("do the thing");
  });

  test("send throws for an unknown agent", async () => {
    const query = makeMockQuery([resultSuccess("ok")]);
    const orch = new Orchestrator({ queryFn: query });

    await expect(orch.send("nope-1", "x")).rejects.toThrow("Unknown agent");
  });

  test("broadcast sends the same prompt to every agent", async () => {
    const query = makeMockQuery([resultSuccess("ok")]);
    const orch = new Orchestrator({ queryFn: query });
    orch.spawn(coder());
    orch.spawn(coder());

    await orch.broadcast("review everything");

    expect(query.calls).toHaveLength(2);
    expect(query.calls.every((c) => c.prompt === "review everything")).toBe(true);
  });

  test("broadcast settles even when an agent's turn errors", async () => {
    const query = makeMockQuery([resultError(["agent boom"])]);
    const orch = new Orchestrator({ queryFn: query });
    orch.spawn(coder());
    orch.spawn(coder());

    await expect(orch.broadcast("x")).resolves.toBeUndefined();
  });

  test("buildOptions clones preset tools and strips ANTHROPIC_API_KEY", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-should-be-stripped";
    const query = makeMockQuery([resultSuccess("ok")]);
    const orch = new Orchestrator({ queryFn: query });
    const agent = orch.spawn(coder());

    await orch.send(agent.id, "x");
    const options = query.calls[0]?.options;

    expect(options?.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(options?.includePartialMessages).toBe(true);
    expect(options?.allowedTools).toEqual([...coder().allowedTools]);
    // Cloned, not the preset's own frozen array.
    expect(options?.allowedTools).not.toBe(coder().allowedTools);
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("resume id flows through on a second send to the same agent", async () => {
    const query = makeMockQuery([resultSuccess("ok", "sess-7")]);
    const orch = new Orchestrator({ queryFn: query });
    const agent = orch.spawn(coder());

    await orch.send(agent.id, "first");
    await orch.send(agent.id, "second");

    expect(query.calls[1]?.options?.resume).toBe("sess-7");
  });

  test("remove stops and forgets the agent", () => {
    const query = makeMockQuery([resultSuccess("ok")], { hang: true });
    const orch = new Orchestrator({ queryFn: query });
    const agent = orch.spawn(coder());

    orch.remove(agent.id);

    expect(orch.get(agent.id)).toBeUndefined();
    expect(orch.list()).toHaveLength(0);
  });
});
