import { describe, expect, test } from "bun:test";
import { capMessages, capRecord } from "./historyCap.ts";

describe("capMessages", () => {
  test("returns the list unchanged when under the cap", () => {
    const list = [1, 2, 3];
    expect(capMessages(list, 5)).toBe(list); // same reference (no-op)
  });

  test("keeps only the last `max` when over", () => {
    expect(capMessages([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  test("max of 0 yields an empty list", () => {
    expect(capMessages([1, 2], 0)).toEqual([]);
  });
});

describe("capRecord", () => {
  test("adds the entry and leaves others when under the cap", () => {
    const next = capRecord({ a: "1", b: "2" }, "c", "3", 5);
    expect(next).toEqual({ a: "1", b: "2", c: "3" });
  });

  test("evicts the oldest insertion-ordered key when over the cap", () => {
    const next = capRecord({ a: "1", b: "2", c: "3" }, "d", "4", 3);
    expect(Object.keys(next)).toEqual(["b", "c", "d"]); // "a" evicted
    expect(next.d).toBe("4");
  });

  test("updating an existing key does not grow the record", () => {
    const next = capRecord({ a: "1", b: "2", c: "3" }, "b", "X", 3);
    expect(Object.keys(next).sort()).toEqual(["a", "b", "c"]);
    expect(next.b).toBe("X");
  });

  test("does not mutate the input", () => {
    const input = { a: "1", b: "2", c: "3" };
    capRecord(input, "d", "4", 3);
    expect(input).toEqual({ a: "1", b: "2", c: "3" });
  });
});
