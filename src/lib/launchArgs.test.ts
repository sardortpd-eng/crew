import { describe, expect, test } from "bun:test";
import { parseLaunchArgs } from "./launchArgs.ts";

describe("parseLaunchArgs", () => {
  test("--dangerously-skip-permissions → bypass mode", () => {
    expect(parseLaunchArgs(["--dangerously-skip-permissions"]).safetyMode).toBe(
      "bypassPermissions",
    );
  });

  test("--plan → plan mode", () => {
    expect(parseLaunchArgs(["--plan"]).safetyMode).toBe("plan");
  });

  test("bypass wins when both are present", () => {
    expect(parseLaunchArgs(["--plan", "--dangerously-skip-permissions"]).safetyMode).toBe(
      "bypassPermissions",
    );
  });

  test("no recognized flags → empty", () => {
    expect(parseLaunchArgs([])).toEqual({});
    expect(parseLaunchArgs(["--whatever"])).toEqual({});
  });
});
