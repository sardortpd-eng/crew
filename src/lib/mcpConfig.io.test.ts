import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addMcpServer, loadMcpConfig, parseServerSpec, projectMcpPath } from "./mcpConfig.ts";

describe("parseServerSpec", () => {
  test("a URL first token becomes a remote http server", () => {
    const r = parseServerSpec(["https://mcp.example.com/"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.server).toEqual({ type: "http", url: "https://mcp.example.com/" });
  });

  test("otherwise it's a stdio command + args", () => {
    const r = parseServerSpec(["npx", "-y", "@playwright/mcp@latest"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.server).toEqual({ command: "npx", args: ["-y", "@playwright/mcp@latest"] });
  });

  test("empty spec is an error", () => {
    expect(parseServerSpec([]).ok).toBe(false);
  });
});

describe("addMcpServer", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crew-mcp-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("creates .crew/mcp.json and the server is then loaded", () => {
    const parsed = parseServerSpec(["npx", "-y", "server"]);
    if (!parsed.ok) throw new Error("parse failed");
    const r = addMcpServer(dir, "tools", parsed.server);
    expect(r.ok).toBe(true);
    expect(existsSync(projectMcpPath(dir))).toBe(true);
    expect(loadMcpConfig(dir).mcpServers.tools).toEqual({ command: "npx", args: ["-y", "server"] });
  });

  test("merges with an existing config rather than clobbering", () => {
    addMcpServer(dir, "a", { command: "a-cmd" });
    addMcpServer(dir, "b", { type: "http", url: "https://b/" });
    const loaded = loadMcpConfig(dir).mcpServers;
    expect(Object.keys(loaded).sort()).toEqual(["a", "b"]);
  });

  test("rejects an unsafe server name", () => {
    expect(addMcpServer(dir, "../evil", { command: "x" }).ok).toBe(false);
  });

  test("writes valid JSON", () => {
    addMcpServer(dir, "a", { command: "a-cmd" });
    expect(() => JSON.parse(readFileSync(projectMcpPath(dir), "utf8"))).not.toThrow();
  });
});
