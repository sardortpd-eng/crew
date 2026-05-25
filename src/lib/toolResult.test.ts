import { describe, expect, test } from "bun:test";
import { summarizeToolResult } from "./toolResult.ts";

describe("summarizeToolResult", () => {
  test("returns a plain string directly", () => {
    expect(summarizeToolResult("hello world")).toBe("hello world");
  });

  test("prefers stdout for shell-style payloads", () => {
    expect(summarizeToolResult({ stdout: "build ok", stderr: "" })).toBe("build ok");
  });

  test("falls back to stderr when stdout is empty", () => {
    expect(summarizeToolResult({ stdout: "", stderr: "boom" })).toBe("boom");
  });

  test("joins content-block arrays", () => {
    const payload = [
      { type: "text", text: "line one" },
      { type: "text", text: "line two" },
    ];
    expect(summarizeToolResult(payload)).toBe("line one line two");
  });

  test("reads a content array nested under .content", () => {
    expect(summarizeToolResult({ content: [{ type: "text", text: "nested" }] })).toBe("nested");
  });

  test("collapses whitespace and truncates long output", () => {
    const long = "x".repeat(300);
    const result = summarizeToolResult(`a\n\n  b   ${long}`);
    expect(result.startsWith("a b x")).toBe(true);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(201);
  });

  test("JSON-stringifies arbitrary objects", () => {
    expect(summarizeToolResult({ foo: 1 })).toBe('{"foo":1}');
  });

  test("handles null/undefined as empty", () => {
    expect(summarizeToolResult(null)).toBe("");
    expect(summarizeToolResult(undefined)).toBe("");
  });
});
