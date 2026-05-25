import { describe, expect, test } from "bun:test";
import type { GateConfig } from "../lib/projectGates.ts";
import type { GateResult } from "../lib/verifyDecision.ts";
import type { VerifyState } from "../state/store.ts";
import { VerifyController } from "./verifyController.ts";

const config = (over: Partial<GateConfig> = {}): GateConfig => ({
  autoVerify: true,
  maxAttempts: 3,
  gates: [{ name: "test", command: "bun test" }],
  ...over,
});

const pass: GateResult = { name: "test", passed: true, exitCode: 0, output: "" };
const failR: GateResult = { name: "test", passed: false, exitCode: 1, output: "boom" };

/** Drains the controller's internal promise chain. */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("VerifyController", () => {
  test("marks passed when gates pass on the first run (no fix sent)", async () => {
    const states: VerifyState[] = [];
    let sends = 0;
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {
        sends += 1;
      },
      onState: (_id, s) => states.push(s),
      loadGates: () => config(),
      runGate: async () => pass,
    });

    c.enqueue("coder-1");
    await settle();

    expect(sends).toBe(0);
    expect(states.at(-1)?.status).toBe("passed");
    expect(c.isVerifying("coder-1")).toBe(false);
  });

  test("fails first, sends a fix, then passes (one fix turn)", async () => {
    const results = [failR, pass];
    let i = 0;
    let sends = 0;
    const states: VerifyState[] = [];
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {
        sends += 1;
      },
      onState: (_id, s) => states.push(s),
      loadGates: () => config(),
      runGate: async () => results[i++] ?? pass,
    });

    c.enqueue("coder-1");
    await settle();

    expect(sends).toBe(1);
    expect(states.at(-1)?.status).toBe("passed");
  });

  test("gives up after maxAttempts and stops sending", async () => {
    let sends = 0;
    const states: VerifyState[] = [];
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {
        sends += 1;
      },
      onState: (_id, s) => states.push(s),
      loadGates: () => config({ maxAttempts: 2 }),
      runGate: async () => failR, // never passes
    });

    c.enqueue("coder-1");
    await settle();

    expect(sends).toBe(1); // attempt 1 fixes; attempt 2 gives up
    expect(states.at(-1)?.status).toBe("failed");
    expect(states.at(-1)?.gate).toBe("test");
  });

  test("no gates → no-op, not verifying", async () => {
    const states: VerifyState[] = [];
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {},
      onState: (_id, s) => states.push(s),
      loadGates: () => config({ gates: [] }),
      runGate: async () => pass,
    });

    c.enqueue("coder-1");
    await settle();

    expect(states).toHaveLength(0);
    expect(c.isVerifying("coder-1")).toBe(false);
  });

  test("serializes two agents (one verify at a time)", async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {},
      onState: () => {},
      loadGates: () => config(),
      runGate: async (gate) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        order.push(gate.name);
        return pass;
      },
    });

    c.enqueue("a");
    c.enqueue("b");
    await settle();
    await new Promise((r) => setTimeout(r, 20));

    expect(maxActive).toBe(1);
  });

  test("emits a terminal failed state if the loop throws (never stuck running)", async () => {
    const states: VerifyState[] = [];
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {
        throw new Error("agent gone");
      }, // first fix-send throws
      onState: (_id, s) => states.push(s),
      loadGates: () => config(),
      runGate: async () => failR,
    });

    c.enqueue("coder-1");
    await settle();

    expect(states.at(-1)?.status).toBe("failed");
    expect(c.isVerifying("coder-1")).toBe(false);
  });

  test("cancel aborts an in-flight gate and reaches a terminal state", async () => {
    const states: VerifyState[] = [];
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {},
      onState: (_id, s) => states.push(s),
      loadGates: () => config(),
      runGate: (_gate, _cwd, signal) =>
        new Promise((_resolve, reject) => {
          if (signal.aborted) return reject(new Error("aborted"));
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });

    c.enqueue("coder-1");
    await new Promise((r) => setTimeout(r, 5));
    expect(c.isVerifying("coder-1")).toBe(true);
    c.cancel("coder-1");
    await settle();

    expect(states.at(-1)?.status).toBe("failed");
    expect(c.isVerifying("coder-1")).toBe(false);
  });

  test("remove stops further fix sends for that agent", async () => {
    let sends = 0;
    const c = new VerifyController({
      cwd: "/tmp",
      send: async () => {
        sends += 1;
        await new Promise((r) => setTimeout(r, 5));
      },
      onState: () => {},
      loadGates: () => config({ maxAttempts: 3 }),
      runGate: async () => failR, // always fails → would keep sending fixes
    });

    c.enqueue("coder-1");
    await new Promise((r) => setTimeout(r, 5));
    c.remove("coder-1");
    await settle();
    await new Promise((r) => setTimeout(r, 10));

    expect(sends).toBeLessThanOrEqual(1); // aborted before burning all attempts
    expect(c.isVerifying("coder-1")).toBe(false);
  });
});
