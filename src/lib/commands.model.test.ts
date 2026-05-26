import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("/model parsing", () => {
  test("each alias parses to its choice", () => {
    for (const m of ["opus", "sonnet", "haiku"] as const) {
      const cmd = parseCommand(`/model ${m}`);
      expect(cmd.kind).toBe("model");
      if (cmd.kind === "model") expect(cmd.choice).toBe(m);
    }
  });

  test("case-insensitive", () => {
    const cmd = parseCommand("/model OPUS");
    if (cmd.kind === "model") expect(cmd.choice).toBe("opus");
    else throw new Error("expected model");
  });

  test("default/reset/off clear the override", () => {
    for (const arg of ["default", "reset", "off"]) {
      const cmd = parseCommand(`/model ${arg}`);
      if (cmd.kind === "model") expect(cmd.choice).toBe("default");
      else throw new Error("expected model");
    }
  });

  test("no arg shows current (no choice)", () => {
    const cmd = parseCommand("/model");
    expect(cmd.kind).toBe("model");
    if (cmd.kind === "model") expect(cmd.choice).toBeUndefined();
  });

  test("an unknown model is an error", () => {
    expect(parseCommand("/model gpt-9").kind).toBe("error");
  });
});
