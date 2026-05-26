import { describe, expect, test } from "bun:test";
import type { Message } from "../state/store.ts";
import {
  clampScroll,
  flattenMessages,
  summarizeToolInput,
  windowLines,
  wrapText,
} from "./windowing.ts";

describe("wrapText", () => {
  test("wraps on word boundaries", () => {
    expect(wrapText("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);
  });

  test("hard-breaks tokens longer than the width", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  test("preserves explicit newlines", () => {
    expect(wrapText("a\nb", 10)).toEqual(["a", "b"]);
  });

  test("returns one empty line for empty input", () => {
    expect(wrapText("", 10)).toEqual([""]);
  });
});

describe("flattenMessages", () => {
  const messages: Message[] = [
    { role: "user", text: "hi" },
    {
      role: "assistant",
      text: "hello",
      tools: [{ id: "t1", name: "Read", input: {} }],
      done: true,
    },
    { role: "error", text: "boom" },
  ];

  test("tags line kinds and renders tool results", () => {
    const lines = flattenMessages(messages, 80, { t1: "3 files" });
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toContain("user");
    expect(kinds).toContain("tool");
    expect(kinds).toContain("toolResult");
    expect(kinds).toContain("assistant");
    expect(kinds).toContain("error");
    expect(lines.find((l) => l.kind === "toolResult")?.text).toContain("3 files");
  });

  test("shows running… when no tool result yet", () => {
    const lines = flattenMessages(messages, 80, {});
    expect(lines.find((l) => l.kind === "toolResult")?.text).toContain("running…");
  });

  test("includes a tool-input summary on the tool line", () => {
    const withInput: Message[] = [
      {
        role: "assistant",
        text: "",
        tools: [{ id: "t1", name: "Bash", input: { command: "bun test" } }],
        done: true,
      },
    ];
    const toolLine = flattenMessages(withInput, 80, {}).find((l) => l.kind === "tool");
    expect(toolLine?.text).toContain("Bash");
    expect(toolLine?.text).toContain("bun test");
  });
});

describe("summarizeToolInput", () => {
  test("picks the most telling field", () => {
    expect(summarizeToolInput({ command: "ls -la" })).toBe("ls -la");
    expect(summarizeToolInput({ file_path: "/a/b.ts" })).toBe("/a/b.ts");
  });

  test("empty input yields no summary", () => {
    expect(summarizeToolInput({})).toBe("");
  });

  test("truncates very long values", () => {
    expect(summarizeToolInput({ command: "x".repeat(200) }).endsWith("…")).toBe(true);
  });
});

describe("clampScroll", () => {
  test("bounds offset to [0, total - viewport]", () => {
    expect(clampScroll(-5, 100, 10)).toBe(0);
    expect(clampScroll(999, 100, 10)).toBe(90);
    expect(clampScroll(20, 100, 10)).toBe(20);
  });
});

describe("windowLines", () => {
  const lines = Array.from({ length: 10 }, (_, i) => ({ kind: "user" as const, text: `l${i}` }));

  test("offset 0 shows the tail (newest)", () => {
    const w = windowLines(lines, 3, 0);
    expect(w.visible.map((l) => l.text)).toEqual(["l7", "l8", "l9"]);
    expect(w.atBottom).toBe(true);
    expect(w.total).toBe(10);
  });

  test("positive offset scrolls up into history", () => {
    const w = windowLines(lines, 3, 2);
    expect(w.visible.map((l) => l.text)).toEqual(["l5", "l6", "l7"]);
    expect(w.atBottom).toBe(false);
  });

  test("clamps an over-scroll to the top", () => {
    const w = windowLines(lines, 3, 999);
    expect(w.visible.map((l) => l.text)).toEqual(["l0", "l1", "l2"]);
  });
});
