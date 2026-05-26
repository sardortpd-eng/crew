import { describe, expect, test } from "bun:test";
import { dropLeadingScouts, parsePlan, planGoal } from "./planner.ts";
import { listPresets } from "./presets.ts";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "./types.ts";

const NAMES = ["coder", "reviewer", "tester", "docs"];
const PRESETS = listPresets();

describe("parsePlan", () => {
  test("parses preset: task lines, stripping bullets/numbering", () => {
    const text = [
      "1. coder: scaffold the API",
      "- tester: write unit tests",
      "* docs: document the endpoints",
    ].join("\n");
    expect(parsePlan(text, NAMES)).toEqual([
      { preset: "coder", title: "scaffold the API" },
      { preset: "tester", title: "write unit tests" },
      { preset: "docs", title: "document the endpoints" },
    ]);
  });

  test("unknown presets fall back to coder; junk lines are skipped", () => {
    const text = "wizard: cast a spell\njust some prose\nreviewer: review it";
    expect(parsePlan(text, NAMES)).toEqual([
      { preset: "coder", title: "cast a spell" },
      { preset: "reviewer", title: "review it" },
    ]);
  });

  test("caps at 10 tasks", () => {
    const text = Array.from({ length: 20 }, (_, i) => `coder: task ${i}`).join("\n");
    expect(parsePlan(text, NAMES)).toHaveLength(10);
  });
});

describe("planGoal", () => {
  function fakeQuery(resultText: string) {
    return (): Query => {
      async function* gen(): AsyncGenerator<SDKMessage, void> {
        yield {
          type: "result",
          subtype: "success",
          result: resultText,
          session_id: "s",
          uuid: "u",
        } as unknown as SDKMessage;
      }
      return gen() as unknown as Query;
    };
  }

  test("returns the parsed tasks from the model", async () => {
    const tasks = await planGoal("build a todo app", PRESETS, {
      queryFn: fakeQuery("coder: build the UI\ntester: add tests"),
    });
    expect(tasks).toEqual([
      { preset: "coder", title: "build the UI" },
      { preset: "tester", title: "add tests" },
    ]);
  });

  test("falls back to a single coder task when the model yields nothing usable", async () => {
    const tasks = await planGoal("do the thing", PRESETS, { queryFn: fakeQuery("hmm no list") });
    expect(tasks).toEqual([{ preset: "coder", title: "do the thing" }]);
  });

  test("falls back when the query throws", async () => {
    const tasks = await planGoal("x", PRESETS, {
      queryFn: () => {
        throw new Error("down");
      },
    });
    expect(tasks).toEqual([{ preset: "coder", title: "x" }]);
  });

  test("greenfield drops a leading exploration task", async () => {
    const plan = "explorer: explore the codebase\ncoder: build it\ntester: test it";
    const normal = await planGoal("g", PRESETS, { queryFn: fakeQuery(plan) });
    expect(normal[0]?.preset).toBe("explorer"); // kept by default
    const green = await planGoal("g", PRESETS, { queryFn: fakeQuery(plan), greenfield: true });
    expect(green.map((t) => t.preset)).toEqual(["coder", "tester"]); // scout dropped
  });
});

describe("dropLeadingScouts", () => {
  test("strips leading explorer/planner/architect, keeps the rest", () => {
    expect(
      dropLeadingScouts([
        { preset: "explorer", title: "look" },
        { preset: "planner", title: "plan" },
        { preset: "coder", title: "build" },
        { preset: "explorer", title: "later" },
      ]).map((t) => t.preset),
    ).toEqual(["coder", "explorer"]); // only leading scouts removed
  });

  test("never returns empty (keeps all if every task is a scout)", () => {
    const all = [{ preset: "explorer", title: "a" }];
    expect(dropLeadingScouts(all)).toEqual(all);
  });
});
