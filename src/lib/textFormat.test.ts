import { describe, expect, test } from "bun:test";
import { deleteLastWord, formatElapsed } from "./textFormat.ts";

describe("formatElapsed", () => {
  test("under a minute shows seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(59)).toBe("59s");
  });

  test("at or over a minute shows m + s", () => {
    expect(formatElapsed(60)).toBe("1m 0s");
    expect(formatElapsed(123)).toBe("2m 3s");
    expect(formatElapsed(162)).toBe("2m 42s");
  });

  test("clamps negatives and floors", () => {
    expect(formatElapsed(-5)).toBe("0s");
    expect(formatElapsed(61.9)).toBe("1m 1s");
  });
});

describe("deleteLastWord", () => {
  test("drops the last word, keeps the rest with a trailing space", () => {
    expect(deleteLastWord("foo bar")).toBe("foo ");
    expect(deleteLastWord("foo bar baz")).toBe("foo bar ");
  });

  test("trailing spaces are stripped before the cut", () => {
    expect(deleteLastWord("foo bar   ")).toBe("foo ");
  });

  test("a single word becomes empty", () => {
    expect(deleteLastWord("foo")).toBe("");
  });

  test("blank or whitespace stays empty", () => {
    expect(deleteLastWord("")).toBe("");
    expect(deleteLastWord("   ")).toBe("");
  });
});
