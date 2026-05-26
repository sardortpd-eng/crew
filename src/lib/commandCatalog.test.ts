import { describe, expect, test } from "bun:test";
import { COMMAND_CATALOG, buildHelpText, findCommand } from "./commandCatalog.ts";

describe("COMMAND_CATALOG", () => {
  test("every entry has a name and a non-empty summary", () => {
    for (const c of COMMAND_CATALOG) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.name.startsWith("/")).toBe(false); // names are stored without the slash
    }
  });

  test("command names are unique", () => {
    const names = COMMAND_CATALOG.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("covers the commands users rely on", () => {
    const names = new Set(COMMAND_CATALOG.map((c) => c.name));
    for (const expected of ["spawn", "mode", "model", "install", "plan", "help", "quit"]) {
      expect(names.has(expected)).toBe(true);
    }
  });
});

describe("findCommand", () => {
  test("resolves by canonical name and by alias", () => {
    expect(findCommand("help")?.name).toBe("help");
    expect(findCommand("?")?.name).toBe("help");
    expect(findCommand("q")?.name).toBe("quit");
    expect(findCommand("nope")).toBeUndefined();
  });
});

describe("buildHelpText", () => {
  test("renders one line per command with the slash and summary", () => {
    const help = buildHelpText();
    expect(help).toContain("/spawn");
    expect(help).toContain("/model");
    expect(help.split("\n").length).toBeGreaterThanOrEqual(COMMAND_CATALOG.length);
  });
});
