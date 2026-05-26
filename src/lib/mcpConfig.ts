import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { join } from "node:path";
import { z } from "zod";
import type { McpServerConfig, Options } from "../engine/types.ts";

type SettingSource = NonNullable<Options["settingSources"]>[number];

/** A stdio MCP server: a local command crew spawns and talks to over stdio. */
const stdioSchema = z.object({
  type: z.literal("stdio").optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

/** A remote MCP server reached over SSE or streamable HTTP. */
const remoteSchema = z.object({
  type: z.enum(["sse", "http"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

const serverSchema = z.union([stdioSchema, remoteSchema]);

const fileSchema = z.object({
  mcpServers: z.record(z.string(), serverSchema).optional(),
  settingSources: z.array(z.enum(["user", "project", "local"])).optional(),
});

export type McpConfig = {
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>;
  readonly settingSources: readonly SettingSource[];
  readonly warnings: readonly string[];
};

/** Default: load project settings so CLAUDE.md + project `.mcp.json` apply. */
const DEFAULT_SETTING_SOURCES: SettingSource[] = ["project"];

export function userMcpPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "crew", "mcp.json");
}

export function projectMcpPath(cwd: string): string {
  return join(cwd, ".crew", "mcp.json");
}

/**
 * Loads MCP servers + setting sources from the user and project config files
 * (project wins on name conflicts). Invalid files are skipped with a warning,
 * never thrown — a broken config must not stop crew from starting.
 */
export function loadMcpConfig(cwd: string): McpConfig {
  const warnings: string[] = [];
  const servers: Record<string, McpServerConfig> = {};
  let settingSources: SettingSource[] = DEFAULT_SETTING_SOURCES;

  for (const path of [userMcpPath(), projectMcpPath(cwd)]) {
    const parsed = readConfigFile(path, warnings);
    if (!parsed) continue;
    Object.assign(servers, parsed.mcpServers ?? {});
    if (parsed.settingSources) settingSources = parsed.settingSources;
  }

  return { mcpServers: servers, settingSources, warnings };
}

/** A server config parsed from a `/mcp add` spec. */
export type ServerConfig = z.infer<typeof serverSchema>;

export type ParsedServer =
  | { readonly ok: true; readonly server: ServerConfig }
  | { readonly ok: false; readonly error: string };

/**
 * Parses the trailing tokens of `/mcp add <name> …` into a server config: a URL
 * first token becomes a remote (http) server, anything else a stdio command +
 * args. Validated against the same schema the loader uses. Pure.
 */
export function parseServerSpec(tokens: readonly string[]): ParsedServer {
  const first = tokens[0];
  if (!first) return { ok: false, error: "provide a command or URL" };
  const candidate = /^https?:\/\//.test(first)
    ? { type: "http" as const, url: first }
    : { command: first, args: tokens.slice(1) };
  const result = serverSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, server: result.data };
}

/**
 * Adds (or replaces) a named server in the project `.crew/mcp.json`, creating
 * the file if absent. Merges with any existing config. Never throws.
 */
export function addMcpServer(
  cwd: string,
  name: string,
  server: ServerConfig,
): { ok: true } | { ok: false; error: string } {
  if (!/^[\w-]+$/.test(name)) {
    return { ok: false, error: "server name must be letters, digits, '-' or '_'" };
  }
  const path = projectMcpPath(cwd);
  let existing: z.infer<typeof fileSchema> = {};
  if (existsSync(path)) {
    try {
      const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
      if (parsed.success) existing = parsed.data;
    } catch {
      return { ok: false, error: `${path}: invalid JSON; fix or remove it first` };
    }
  }
  const next = {
    ...existing,
    mcpServers: { ...(existing.mcpServers ?? {}), [name]: server },
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return { ok: true };
}

function readConfigFile(path: string, warnings: string[]): z.infer<typeof fileSchema> | null {
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    warnings.push(`${path}: invalid JSON; skipped`);
    return null;
  }
  const result = fileSchema.safeParse(raw);
  if (!result.success) {
    warnings.push(`${path}: ${result.error.issues.map((i) => i.message).join("; ")}`);
    return null;
  }
  return result.data;
}
