import { describe, expect, test } from "bun:test";
import { greenMergeOrder } from "./parallelRun.ts";

describe("greenMergeOrder", () => {
  test("merges all when every task is green", () => {
    expect(
      greenMergeOrder([
        { id: "a", outcome: "done" },
        { id: "b", outcome: "done" },
      ]),
    ).toEqual(["a", "b"]);
  });

  test("stops before the first failed task", () => {
    expect(
      greenMergeOrder([
        { id: "a", outcome: "done" },
        { id: "b", outcome: "failed" },
        { id: "c", outcome: "done" },
      ]),
    ).toEqual(["a"]); // c is NOT merged even though it's green
  });

  test("a leading failure merges nothing", () => {
    expect(greenMergeOrder([{ id: "a", outcome: "failed" }])).toEqual([]);
  });

  test("empty is empty", () => {
    expect(greenMergeOrder([])).toEqual([]);
  });
});
