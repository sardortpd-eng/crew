import { describe, expect, test } from "bun:test";
import { checkpointAction, isCheckpointMode } from "./checkpointMode.ts";

describe("isCheckpointMode", () => {
  test("accepts the three modes, rejects others", () => {
    expect(isCheckpointMode("ask")).toBe(true);
    expect(isCheckpointMode("auto")).toBe(true);
    expect(isCheckpointMode("off")).toBe(true);
    expect(isCheckpointMode("nope")).toBe(false);
  });
});

describe("checkpointAction", () => {
  test("off never checkpoints", () => {
    expect(checkpointAction("off", false)).toBe("skip");
    expect(checkpointAction("off", true)).toBe("skip");
  });

  test("auto always commits silently", () => {
    expect(checkpointAction("auto", false)).toBe("commit");
    expect(checkpointAction("auto", true)).toBe("commit");
  });

  test("ask prompts on an interactive turn", () => {
    expect(checkpointAction("ask", false)).toBe("ask");
  });

  test("ask commits silently inside an automated batch (/run, /lead)", () => {
    expect(checkpointAction("ask", true)).toBe("commit");
  });
});
