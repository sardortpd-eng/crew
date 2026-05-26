import { describe, expect, test } from "bun:test";
import { parseCommand } from "./commands.ts";

describe("parseCommand: /mcp", () => {
  test("parses /mcp", () => {
    expect(parseCommand("/mcp")).toEqual({ kind: "mcp" });
  });

  test("ignores trailing args", () => {
    expect(parseCommand("/mcp status")).toEqual({ kind: "mcp" });
  });

  test("parses /mcp add with a command + args", () => {
    const cmd = parseCommand("/mcp add tools npx -y @playwright/mcp");
    expect(cmd).toEqual({
      kind: "mcp",
      op: { type: "add", name: "tools", spec: ["npx", "-y", "@playwright/mcp"] },
    });
  });

  test("parses /mcp add with a URL", () => {
    const cmd = parseCommand("/mcp add db https://mcp.example.com/");
    if (cmd.kind === "mcp" && cmd.op?.type === "add") {
      expect(cmd.op.name).toBe("db");
      expect(cmd.op.spec).toEqual(["https://mcp.example.com/"]);
    } else {
      throw new Error("expected mcp add");
    }
  });

  test("/mcp add without a name or spec is an error", () => {
    expect(parseCommand("/mcp add").kind).toBe("error");
    expect(parseCommand("/mcp add tools").kind).toBe("error");
  });
});
