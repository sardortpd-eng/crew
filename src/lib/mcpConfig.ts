import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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
