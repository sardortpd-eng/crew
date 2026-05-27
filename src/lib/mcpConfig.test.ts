import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMcpConfig } from "./mcpConfig.ts";

let configDir: string;
let cwd: string;
const prevXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "crew-mcpcfg-"));
  cwd = mkdtempSync(join(tmpdir(), "crew-mcpcwd-"));
  process.env.XDG_CONFIG_HOME = configDir;
});
afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
});

function writeProject(obj: unknown) {
  mkdirSync(join(cwd, ".crew"), { recursive: true });
  writeFileSync(join(cwd, ".crew", "mcp.json"), JSON.stringify(obj));
}

describe("loadMcpConfig", () => {
  test("defaults to user+project+local setting sources and no servers", () => {
    const cfg = loadMcpConfig(cwd);
    expect(cfg.mcpServers).toEqual({});
    expect(cfg.settingSources).toEqual(["user", "project", "local"]);
    expect(cfg.warnings).toEqual([]);
  });

  test("loads stdio and remote servers", () => {
    writeProject({
      mcpServers: {
        playwright: { command: "npx", args: ["-y", "@playwright/mcp"] },
        supabase: { type: "http", url: "https://mcp.example.com" },
      },
    });
    const cfg = loadMcpConfig(cwd);
    expect(Object.keys(cfg.mcpServers).sort()).toEqual(["playwright", "supabase"]);
  });

  test("honors a settingSources override", () => {
    writeProject({ settingSources: ["user", "project"], mcpServers: {} });
    expect(loadMcpConfig(cwd).settingSources).toEqual(["user", "project"]);
  });

  test("warns and skips an invalid server (bad url)", () => {
    writeProject({ mcpServers: { bad: { type: "http", url: "not-a-url" } } });
    const cfg = loadMcpConfig(cwd);
    expect(cfg.warnings.length).toBeGreaterThan(0);
    expect(cfg.mcpServers).toEqual({});
  });

  test("warns on invalid JSON without throwing", () => {
    mkdirSync(join(cwd, ".crew"), { recursive: true });
    writeFileSync(join(cwd, ".crew", "mcp.json"), "{ not json");
    const cfg = loadMcpConfig(cwd);
    expect(cfg.warnings.some((w) => w.includes("invalid JSON"))).toBe(true);
  });
});
