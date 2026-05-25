import { describe, expect, test } from "bun:test";
import { runGate, type SpawnFn } from "./verifier.ts";

const gate = { name: "test", command: "bun test" };

describe("runGate", () => {
  test("passes when exit code is 0", async () => {
    const spawn: SpawnFn = async () => ({ exitCode: 0, output: "ok" });
    const result = await runGate(gate, "/tmp", new AbortController().signal, spawn);
    expect(result).toEqual({ name: "test", passed: true, exitCode: 0, output: "ok" });
  });

  test("fails and captures output when exit code is non-zero", async () => {
    const spawn: SpawnFn = async () => ({ exitCode: 1, output: "1 failing" });
    const result = await runGate(gate, "/tmp", new AbortController().signal, spawn);
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("1 failing");
  });

  test("truncates very long output to the tail", async () => {
    const spawn: SpawnFn = async () => ({ exitCode: 1, output: `${"x".repeat(5000)}END` });
    const result = await runGate(gate, "/tmp", new AbortController().signal, spawn);
    expect(result.output.endsWith("END")).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(3000);
  });

  test("turns a spawn error into a failing result", async () => {
    const spawn: SpawnFn = async () => {
      throw new Error("command not found");
    };
    const result = await runGate(gate, "/tmp", new AbortController().signal, spawn);
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(-1);
    expect(result.output).toContain("command not found");
  });

  test("real bunSpawn: runs a shell command and captures stdout", async () => {
    const result = await runGate(
      { name: "echo", command: "echo hello-crew" },
      "/tmp",
      new AbortController().signal,
    );
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hello-crew");
  });

  test("real bunSpawn: a non-zero exit is a failing gate", async () => {
    const result = await runGate(
      { name: "false", command: "exit 3" },
      "/tmp",
      new AbortController().signal,
    );
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(3);
  });
});
